package main

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"slices"
	"strings"
	"time"
)

const maxPayload = 32 * 1024 * 1024
const maxJSON = 48 * 1024 * 1024
const image = "mysql@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902"
const commandRoute = "/v1/mysql/command"

var instanceName = regexp.MustCompile(`^cs-sql-(school|learner)-[a-f0-9]{24}$`)
var instanceID = regexp.MustCompile(`^[a-f0-9]{64}$`)
var label = regexp.MustCompile(`^label=codesomething\.(scope=[a-f0-9]{64}|public-mysql=1|mysql-slot=cs-mysql-slot-[a-z0-9-]{3,36})$`)
var slotMount = regexp.MustCompile(`^--mount=type=volume,source=cs-mysql-slot-[a-z0-9-]{3,36}-(0[1-9]|1[0-5]),target=(/slot|/var/lib/mysql),volume-nocopy$`)
var mysqlParameter = regexp.MustCompile(`^(-u(root|school_student|cs_[a-z0-9_]{1,62})|--database=[a-z][a-z0-9_]{0,63}|[a-z][a-z0-9_]{0,63})$`)

type request struct {
	Args  []string `json:"args"`
	Input []byte   `json:"input"`
}

type response struct {
	Stdout []byte `json:"stdout"`
	Stderr []byte `json:"stderr"`
	Exit   int    `json:"exit"`
}

type configuration struct {
	Endpoint  string `json:"endpoint"`
	Token     string `json:"token"`
	PortToken string `json:"portToken"`
	Docker    string `json:"docker"`
	Socket    string `json:"socket"`
	Address   string `json:"address"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	if socket := os.Getenv("CS_MYSQL_EXECUTOR_SOCKET"); socket != "" {
		client := &http.Client{
			Timeout: 39 * time.Second,
			Transport: &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
				return (&net.Dialer{}).DialContext(ctx, "unix", socket)
			}},
		}
		return printResult(send(client, "http://localhost"+commandRoute, "", "", os.Args[1:], os.Stdin))
	}
	path := os.Getenv("CS_MYSQL_EXECUTOR_CONFIG")
	stat, err := os.Stat(path)
	if err != nil || !stat.Mode().IsRegular() || stat.Mode().Perm()&0077 != 0 {
		return errors.New("MySQL executor requires a private configuration file")
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return errors.New("Cannot read the MySQL executor configuration")
	}
	var config configuration
	if err := json.Unmarshal(content, &config); err != nil || len(config.Token) < 32 {
		return errors.New("Invalid MySQL executor configuration")
	}
	if len(os.Args) == 2 && os.Args[1] == "relay" {
		return relay(config)
	}
	if len(os.Args) == 2 && os.Args[1] == "serve" {
		if !strings.HasPrefix(config.Socket, "unix:///run/user/") || config.Docker != "/usr/bin/docker" {
			return errors.New("A dedicated rootless Docker socket is required")
		}
		gate := make(chan struct{}, 16)
		server := &http.Server{
			Addr: config.Address, ReadHeaderTimeout: 4 * time.Second,
			ReadTimeout: 35 * time.Second, WriteTimeout: 45 * time.Second, IdleTimeout: 10 * time.Second,
			Handler: newHandler(config.Token, func(r *http.Request, args []string, input []byte) response {
				select {
				case gate <- struct{}{}:
					defer func() { <-gate }()
				default:
					return response{Stderr: []byte("MySQL executor is busy\n"), Exit: 75}
				}
				if startsInstance(args) && !inServiceHours(time.Now()) {
					return response{Stderr: []byte("MySQL service is outside its open window\n"), Exit: 75}
				}
				return execute(r.Context(), config, args, input)
			}),
		}
		return server.ListenAndServe()
	}
	return printResult(call(config, os.Args[1:], os.Stdin))
}

func printResult(result response, err error) error {
	if err != nil {
		return err
	}
	if _, err = os.Stdout.Write(result.Stdout); err != nil {
		return err
	}
	if _, err = os.Stderr.Write(result.Stderr); err != nil {
		return err
	}
	os.Exit(result.Exit)
	return nil
}

func startsInstance(args []string) bool {
	return args[0] == "start" || args[0] == "run"
}

func inServiceHours(now time.Time) bool {
	utc := now.UTC()
	minute := utc.Hour()*60 + utc.Minute()
	return minute >= 60 && minute < 270 || minute >= 360 && minute < 570 ||
		minute >= 630 && minute < 1020
}

func relay(config configuration) error {
	path := config.Address
	if path == "" || !strings.HasSuffix(path, "/mysql.sock") {
		return errors.New("A private local MySQL relay socket is required")
	}
	if previous, err := os.Lstat(path); err == nil {
		if previous.Mode()&os.ModeSocket == 0 {
			return errors.New("MySQL relay path is occupied")
		}
		if err := os.Remove(path); err != nil {
			return err
		}
	}
	listener, err := net.Listen("unix", path)
	if err != nil {
		return err
	}
	defer listener.Close()
	if err := os.Chmod(path, 0600); err != nil {
		return err
	}
	server := &http.Server{
		ReadHeaderTimeout: 4 * time.Second, ReadTimeout: 35 * time.Second, WriteTimeout: 45 * time.Second,
		Handler: newHandler("", func(_ *http.Request, args []string, input []byte) response {
			result, err := call(config, args, bytes.NewReader(input))
			if err != nil {
				return response{Stderr: []byte(err.Error()+"\n"), Exit: 75}
			}
			return result
		}),
	}
	return server.Serve(listener)
}

func newHandler(token string, operation func(*http.Request, []string, []byte) response) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != commandRoute || r.Method != http.MethodPost ||
			(token != "" && subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+token)) != 1) {
			http.NotFound(w, r)
			return
		}
		var payload request
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxJSON))
		decoder.DisallowUnknownFields()
		if decoder.Decode(&payload) != nil || decoder.Decode(new(any)) != io.EOF ||
			len(payload.Input) > maxPayload || !validCommand(payload.Args) {
			http.Error(w, "Invalid MySQL operation", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(operation(r, payload.Args, payload.Input))
	}
}

func validCommand(args []string) bool {
	if len(args) < 2 || len(args) > 96 {
		return false
	}
	for _, arg := range args {
		if len(arg) > 4096 || strings.ContainsAny(arg, "\x00\r\n") {
			return false
		}
	}
	target := func(value string) bool { return instanceName.MatchString(value) || instanceID.MatchString(value) }
	switch args[0] {
	case "ps", "volume":
		return validList(args)
	case "inspect":
		return target(args[len(args)-1]) && (len(args) == 2 ||
			slices.Equal(args[1:len(args)-1], []string{"--format", "{{.State.Running}}"}) ||
			slices.Equal(args[1:len(args)-1], []string{"--format={{.State.Running}}"}))
	case "start":
		return len(args) == 2 && target(args[1])
	case "stop":
		return len(args) == 4 && args[1] == "-t" && args[2] == "10" && target(args[3])
	case "rm":
		return len(args) == 3 && args[1] == "-v" && target(args[2])
	case "exec":
		return validExec(args[1:], target)
	case "run":
		return validRun(args[1:])
	}
	return false
}

func validList(args []string) bool {
	if args[0] == "volume" {
		if args[1] != "ls" {
			return false
		}
		args = args[2:]
	} else {
		args = args[1:]
	}
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-a", "--no-trunc":
		case "--filter":
			i++
			if i == len(args) || !label.MatchString(args[i]) {
				return false
			}
		case "--format":
			i++
			if i == len(args) || !slices.Contains([]string{"{{.Names}}", "{{.Name}}", "{{.Mounts}}", "{{.ID}} {{.Names}}", "{{json .}}"}, args[i]) {
				return false
			}
		default:
			return false
		}
	}
	return true
}

func validExec(args []string, target func(string) bool) bool {
	for len(args) > 0 && slices.Contains([]string{"-i", "--user=mysql", "--user=999:999"}, args[0]) {
		args = args[1:]
	}
	if len(args) < 2 || !target(args[0]) {
		return false
	}
	args = args[1:]
	if slices.Equal(args, []string{"cat", "/proc/1/comm"}) {
		return true
	}
	if len(args) >= 4 && args[0] == "timeout" {
		if !slices.Contains([]string{"--kill-after=1s", "--kill-after=2s"}, args[1]) ||
			!slices.Contains([]string{"5s", "15s"}, args[2]) {
			return false
		}
		args = args[3:]
	}
	if !slices.Contains([]string{"mysql", "mysqldump"}, args[0]) {
		return false
	}
	for i := 1; i < len(args); i++ {
		arg := args[i]
		if arg == "-e" && args[0] == "mysql" && i+1 < len(args) {
			i++
			continue
		}
		if !mysqlParameter.MatchString(arg) && !slices.Contains(mysqlOptions, arg) {
			return false
		}
	}
	return len(args) > 1 && slices.Contains(args, "--protocol=socket")
}

var mysqlOptions = []string{
	"--protocol=socket", "--no-defaults", "--batch", "--default-character-set=utf8mb4", "--binary-mode=1",
	"--binary-as-hex", "--xml", "--column-type-info", "--force", "--verbose", "--comments", "-vvv", "-NB", "-N", "-B",
	"--local-infile=0", "--skip-reconnect", "--set-gtid-purged=OFF", "--no-tablespaces",
	"--lock-all-tables", "--routines", "--events", "--triggers", "--hex-blob", "--databases", "--single-transaction",
}

const wipeSlot = "set -eu; [ \"$(stat -f -c %T /slot)\" = ext2/ext3 ]; " +
	"df -Pk /slot | awk 'NR==2 && $2>=300000 && $2<=393216 {ok=1} END {exit !ok}'; " +
	"find /slot -mindepth 1 -maxdepth 1 -exec rm -rf --one-file-system -- {} +; " +
	"test -z \"$(ls -A /slot)\""

func validRun(args []string) bool {
	position := slices.Index(args, image)
	if position < 1 {
		return false
	}
	flags, after := args[:position], args[position+1:]
	wipe := slices.Equal(after, []string{"-c", wipeSlot})
	mountTarget := "target=/var/lib/mysql,"
	if wipe {
		mountTarget = "target=/slot,"
	}
	mounts, names := 0, 0
	for i := 0; i < len(flags); i++ {
		arg := flags[i]
		switch {
		case arg == "--name" && i+1 < len(flags) && instanceName.MatchString(flags[i+1]):
			i++
			names++
		case strings.HasPrefix(arg, "--label=") &&
			(slices.Contains([]string{"--label=codesomething.sql=1", "--label=codesomething.public-mysql=1",
				"--label=codesomething.mysql-disk=1"}, arg) || label.MatchString(strings.TrimPrefix(arg, "--"))):
		case slotMount.MatchString(arg) && strings.Contains(arg, mountTarget):
			mounts++
		case slices.Contains(runOptions, arg):
		default:
			return false
		}
	}
	for _, required := range []string{"--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "--user=999:999", "--security-opt=no-new-privileges"} {
		if !slices.Contains(flags, required) {
			return false
		}
	}
	if wipe {
		return names == 0 && mounts == 1 && slices.Contains(flags, "--rm") &&
			slices.Contains(flags, "--entrypoint=/bin/sh") && !slices.Contains(flags, "-d") &&
			hasAll(flags, "--memory=64m", "--cpus=0.5", "--pids-limit=32")
	}
	if names != 1 || mounts != 1 || !slices.Contains(flags, "-d") ||
		slices.Contains(flags, "--entrypoint=/bin/sh") ||
		!hasAll(flags, "--label=codesomething.public-mysql=1", "--memory=512m", "--memory-swap=512m", "--cpus=1", "--pids-limit=64") {
		return false
	}
	for _, arg := range after {
		if !slices.Contains(serverOptions, arg) {
			return false
		}
	}
	return slices.Contains(after, "--skip-networking") && slices.Contains(after, "--local-infile=0")
}

func hasAll(values []string, required ...string) bool {
	for _, value := range required {
		if !slices.Contains(values, value) {
			return false
		}
	}
	return true
}

var runOptions = []string{
	"-d", "--rm", "--pull=never", "--network=none", "--read-only", "--cap-drop=ALL",
	"--memory=64m", "--memory=512m", "--memory-swap=512m", "--cpus=0.5", "--cpus=1",
	"--pids-limit=32", "--pids-limit=64", "--security-opt=no-new-privileges", "--user=999:999",
	"--log-driver=none", "--entrypoint=/bin/sh", "--tmpfs=/var/run/mysqld:rw,nosuid,nodev,size=16m,mode=1777",
	"--tmpfs=/tmp:rw,nosuid,nodev,size=32m,mode=1777", "--env=MYSQL_ALLOW_EMPTY_PASSWORD=yes", "--env=MYSQL_ROOT_HOST=localhost",
}

var serverOptions = []string{"--skip-networking", "--local-infile=0", "--secure-file-priv=NULL",
	"--max-connections=5", "--innodb-buffer-pool-size=48M", "--performance-schema=OFF",
	"--character-set-server=utf8mb4", "--innodb-use-native-aio=OFF", "--skip-log-bin"}

type limitedOutput struct {
	buffer bytes.Buffer
	max int
}

func (output *limitedOutput) Write(p []byte) (int, error) {
	if output.buffer.Len()+len(p) > output.max {
		return 0, errors.New("MySQL output reached its limit")
	}
	return output.buffer.Write(p)
}

func execute(ctx context.Context, config configuration, args []string, input []byte) response {
	deadline, cancel := context.WithTimeout(ctx, 38*time.Second)
	defer cancel()
	cmd := exec.CommandContext(deadline, config.Docker, append([]string{"--host", config.Socket}, args...)...)
	cmd.Stdin = bytes.NewReader(input)
	stdout, stderr := &limitedOutput{max: maxPayload}, &limitedOutput{max: 256 * 1024}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	err := cmd.Run()
	exit := 0
	var exited *exec.ExitError
	if errors.As(err, &exited) && exited.ExitCode() > 0 {
		exit = exited.ExitCode()
	} else if err != nil {
		return response{Stderr: []byte("MySQL executor could not finish the operation\n"), Exit: 1}
	}
	return response{Stdout: stdout.buffer.Bytes(), Stderr: stderr.buffer.Bytes(), Exit: exit}
}

func call(config configuration, args []string, stdin io.Reader) (response, error) {
	var result response
	origin, err := url.Parse(config.Endpoint)
	if err != nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil ||
		origin.Path != "" || origin.RawQuery != "" || origin.Fragment != "" || config.PortToken == "" {
		return result, errors.New("A private HTTPS MySQL executor origin is required")
	}
	client := &http.Client{Timeout: 39 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	return send(client, origin.ResolveReference(&url.URL{Path: commandRoute}).String(),
		config.Token, config.PortToken, args, stdin)
}

func send(client *http.Client, endpoint, token, portToken string, args []string, stdin io.Reader) (response, error) {
	var result response
	if !validCommand(args) {
		return result, errors.New("Unsupported MySQL executor operation")
	}
	payload := request{Args: args}
	if args[0] == "exec" && slices.Contains(args[:min(4, len(args))], "-i") {
		input, err := io.ReadAll(io.LimitReader(stdin, maxPayload+1))
		payload.Input = input
		if err != nil || len(payload.Input) > maxPayload {
			return result, errors.New("MySQL input reached its limit")
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return result, errors.New("Cannot encode MySQL operation")
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return result, errors.New("Cannot create MySQL operation")
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		req.AddCookie(&http.Cookie{Name: "__Host-instabox_port_auth", Value: portToken})
	}
	reply, err := client.Do(req)
	if err != nil {
		return result, errors.New("Private MySQL node is unavailable")
	}
	defer reply.Body.Close()
	if reply.StatusCode != http.StatusOK {
		return result, fmt.Errorf("Private MySQL node returned HTTP %d", reply.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(reply.Body, maxJSON)).Decode(&result); err != nil || result.Exit < 0 || result.Exit > 255 {
		return result, errors.New("Invalid MySQL executor response")
	}
	return result, nil
}
