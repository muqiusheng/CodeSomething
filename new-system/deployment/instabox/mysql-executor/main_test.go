package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestBeijingOpeningAndClosingMinutes(t *testing.T) {
	for _, tc := range []struct {
		hour, minute int
		open         bool
	}{
		{0, 59, false}, {1, 0, true}, {4, 29, true}, {4, 30, false},
		{5, 59, false}, {6, 0, true}, {9, 29, true}, {9, 30, false},
		{10, 29, false}, {10, 30, true}, {15, 59, true}, {16, 0, true},
		{16, 59, true}, {17, 0, false},
	} {
		now := time.Date(2026, 11, 26, tc.hour, tc.minute, 0, 0, time.UTC)
		if inServiceHours(now.In(time.FixedZone("CST", 8*3600))) != tc.open {
			t.Fatalf("unexpected service state at %s", now)
		}
	}
}

func TestOnlyAuthenticatedMysqlCommandsReachExecutor(t *testing.T) {
	const token = "fixture-service-token-of-at-least-thirty-two-characters"
	const container = "cs-sql-school-0123456789abcdef01234567"
	calls := 0
	handler := newHandler(token, func(_ *http.Request, args []string, input []byte) response {
		calls++
		if !bytes.Equal(input, []byte("SELECT 1;")) || args[len(args)-1] != "--protocol=socket" {
			t.Fatalf("unexpected input %q or arguments %v", input, args)
		}
		return response{Stdout: []byte("1\n"), Stderr: []byte("warning\n"), Exit: 0}
	})
	for _, tc := range []struct {
		token string
		args  []string
		want  int
	}{
		{"wrong", []string{"exec", "-i", container, "mysql", "--protocol=socket"}, 404},
		{token, []string{"exec", "-i", container, "sh"}, 400},
		{token, []string{"exec", "-i", container, "mysql", "--local-infile=1"}, 400},
		{token, []string{"rm", "-f", "codesomething-instabox-backend-1"}, 400},
		{token, []string{"run", "--privileged", "alpine", "sh"}, 400},
		{token, []string{"exec", "-i", container, "mysql", "--protocol=socket"}, 200},
	} {
		body, _ := json.Marshal(request{Args: tc.args, Input: []byte("SELECT 1;")})
		req := httptest.NewRequest("POST", "/v1/mysql/command", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tc.token)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
		if recorder.Code != tc.want {
			t.Fatalf("%v got HTTP %d, want %d", tc.args, recorder.Code, tc.want)
		}
		if tc.want == 200 {
			var got response
			if err := json.Unmarshal(recorder.Body.Bytes(), &got); err != nil ||
				string(got.Stdout) != "1\n" || string(got.Stderr) != "warning\n" {
				t.Fatalf("invalid response: %s", recorder.Body)
			}
		}
	}
	if calls != 1 {
		t.Fatalf("executed %d commands, want 1", calls)
	}
}
