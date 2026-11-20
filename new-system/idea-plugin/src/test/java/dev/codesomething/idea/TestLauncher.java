package dev.codesomething.idea;

import java.io.PrintWriter;
import org.junit.platform.engine.discovery.DiscoverySelectors;
import org.junit.platform.launcher.core.LauncherDiscoveryRequestBuilder;
import org.junit.platform.launcher.core.LauncherFactory;
import org.junit.platform.launcher.listeners.SummaryGeneratingListener;

/** Runs core JUnit tests with the existing local SDK toolchain. */
public final class TestLauncher {
    public static void main(String[] args) {
        var listener = new SummaryGeneratingListener();
        var launcher = LauncherFactory.create();
        launcher.registerTestExecutionListeners(listener);
        launcher.execute(LauncherDiscoveryRequestBuilder.request()
            .selectors(DiscoverySelectors.selectClass(PairingClientTest.class)).build());
        listener.getSummary().printTo(new PrintWriter(System.out, true));
        listener.getSummary().printFailuresTo(new PrintWriter(System.out, true));
        if (listener.getSummary().getTestsFoundCount() == 0 || listener.getSummary().getTotalFailureCount() > 0) {
            System.exit(1);
        }
    }
}
