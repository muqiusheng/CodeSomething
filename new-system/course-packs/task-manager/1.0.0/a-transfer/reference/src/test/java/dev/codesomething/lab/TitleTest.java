package dev.codesomething.lab;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class TitleTest {
    @Test void blankTitleIsRejectedAndSpacesAreRemoved() {
        var service=new TaskService(null);
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.title(new TaskService.Input(" ",false)));
        assertEquals("Java",service.title(new TaskService.Input(" Java ",false)));
    }
}
