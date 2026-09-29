// INTENTIONALLY INSECURE TEST DATA — fake demo code for CODEFORENSIC AI.
package college;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

public class Database {

    // Fake credential for testing the "hardcoded secret" rule.
    private static final String DB_PASSWORD = "Demo#Pass2024";
    private static final String DB_URL = "jdbc:mysql://localhost:3306/college";

    public Connection connect() throws Exception {
        return DriverManager.getConnection(DB_URL, "root", DB_PASSWORD);
    }

    public ResultSet findStudent(String userId) throws Exception {
        Statement stmt = connect().createStatement();
        String query =
            "SELECT * FROM students WHERE id=" + userId;
        return stmt.executeQuery(query);
    }

    public void debugLogin(String username, String password) {
        System.out.println("Login attempt: " + username + " / " + password);
    }
}
