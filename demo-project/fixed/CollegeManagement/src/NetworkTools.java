// INTENTIONALLY INSECURE TEST DATA — fake demo code for CODEFORENSIC AI.
package college;

public class NetworkTools {

    public void ping(String host) throws Exception {
        // Builds a shell command from a parameter.
        Runtime.getRuntime().exec("ping -c 1 " + host);
    }
}
