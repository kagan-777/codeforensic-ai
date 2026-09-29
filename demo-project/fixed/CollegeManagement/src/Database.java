// INTENTIONALLY INSECURE TEST DATA — fake demo code for CODEFORENSIC AI.
package college;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.PreparedStatement;

public class Database {

    // Fake credential for testing the "hardcoded secret" rule.
    private static final String DB_PASSWORD = System.getenv("DB_PASSWORD");
    private static final String DB_URL = "jdbc:mysql://localhost:3306/college";

    public Connection connect() throws Exception {
        return DriverManager.getConnection(DB_URL, "root", DB_PASSWORD);
    }

    public ResultSet findStudent(String userId) throws Exception {
        PreparedStatement stmt = connect().prepareStatement("SELECT * FROM students WHERE id = ?");
        stmt.setString(1, userId);
        return stmt.executeQuery();
    }

    public void debugLogin(String username, String password) {
        System.out.println("Login attempt for user: " + username);
    }
}
