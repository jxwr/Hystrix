package com.netflix.hystrix.dashboard.stream;

import com.google.gson.Gson;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

// Very simple CRUD, doGet for all, single connection
public class StreamInfoLocalStorageServlet extends HttpServlet {

    private static final String dbName = "hystrix_streams";
    private static final String dbUrl = "jdbc:h2:./db/hystrix_streams_db";

    private static final Log log = LogFactory.getLog(StreamInfoLocalStorageServlet.class);

    private static final long serialVersionUID = 1L;

    public StreamInfoLocalStorageServlet() {
        try {
            Class.forName("org.h2.Driver");
        } catch (ClassNotFoundException e) {
            log.error(e.getMessage());
        }
    }

    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        response.setContentType("application/json; charset=UTF-8");

        String action = request.getParameter("action");
        Connection conn = getConnection();
        try {
            createTableIfNotExists(conn);
        } catch (SQLException e) {
            log.error("Create table failed, " + e.getMessage());
            writeResponse(response, 1, "Create table failed, " + e.getMessage());
            return;
        }

        if ("create".equals(action)) {
            handleCreate(conn, request, response);
        } else if ("read".equals(action)) {
            handleRead(conn, request, response);
        } else if ("delete".equals(action)) {
            handleDelete(conn, request, response);
        } else {
            log.error("Invalid action " + (action == null ? "null" : action));
            writeResponse(response, 1, "Invalid action.");
        }

        try {
            conn.close();
        } catch (SQLException e) {
            log.error(e.getMessage());
            writeResponse(response, 1, "Close conneciton failure, " + e.getMessage());
        }
    }

    private void handleCreate(Connection conn, HttpServletRequest request, HttpServletResponse response) throws IOException {
        String insertSql ="INSERT INTO " + dbName + " (org, service, stream, delay) VALUES (?,?,?,?)";

        String org = request.getParameter("org");
        String service = request.getParameter("service");
        String stream = request.getParameter("stream");
        String delay = request.getParameter("delay");

        try {
            PreparedStatement stmt = null;
            try {
                stmt = conn.prepareStatement(insertSql);
                stmt.setString(1, org);
                stmt.setString(2, service);
                stmt.setString(3, stream);
                stmt.setInt(4, Integer.parseInt(delay));

                int n = stmt.executeUpdate();
                writeResponse(response, 0, n);
            } finally {
                if (stmt != null) { stmt.close(); }
            }
        } catch (SQLException e) {
            writeResponse(response, 1, e.getMessage());
            log.error(e.getMessage());
        }
    }

    private void handleDelete(Connection conn, HttpServletRequest request, HttpServletResponse response) throws IOException {
        String delete ="DELETE FROM " + dbName + " WHERE id = ?";

        String idStr = request.getParameter("id");
        int id = Integer.parseInt(idStr);

        try {
            PreparedStatement stmt = null;
            try {
                stmt = conn.prepareStatement(delete);
                stmt.setInt(1, id);

                int n = stmt.executeUpdate();
                writeResponse(response, 0, n);
            } finally {
                if (stmt != null) { stmt.close(); }
            }
        } catch (SQLException e) {
            writeResponse(response, 1, e.getMessage());
            log.error(e.getMessage());
        }
    }

    private void handleRead(Connection conn, HttpServletRequest request, HttpServletResponse response) throws IOException {
        final String query ="SELECT * FROM " + dbName;
        Statement stmt = null;
        try {
            List<StreamInfo> infos = new ArrayList<StreamInfo>();
            try {
                stmt = conn.createStatement();
                ResultSet rs = stmt.executeQuery(query);
                while (rs.next()) {
                    int id = rs.getInt("id");
                    String org = rs.getString("org");

                    String service = rs.getString("service");
                    String stream = rs.getString("stream");
                    int delay = rs.getInt("delay");

                    StreamInfo info = new StreamInfo(id, org, service, stream, delay);
                    infos.add(info);

                    log.debug(id + "\t" + org + "\t" + service + "\t" + stream + "\t" + delay);
                }
                writeResponse(response, 0, infos);
            } catch (SQLException e ) {
                log.error(e.getMessage());
                writeResponse(response, 1, e.getMessage());
            } finally {
                if (stmt != null) {
                    stmt.close();
                }
            }
        } catch (SQLException e) {
            log.error(e.getMessage());
            writeResponse(response, 1, e.getMessage());
        }
    }

    /// helpers

    private Connection getConnection() throws ServletException {
        Connection conn;
        try {
            conn = DriverManager.getConnection(dbUrl);
            return conn;
        } catch (SQLException e) {
            log.error(e.getMessage());
            throw new ServletException(e);
        }
    }

    private void writeResponse(HttpServletResponse response, int code, Object object) throws IOException {
        Gson gson = new Gson();
        Resp resp = new Resp(code, object);

        String json = gson.toJson(resp);
        log.info("response=" + json);
        response.getOutputStream().write(json.getBytes());
    }

    private void createTableIfNotExists(Connection conn) throws SQLException {
        String createString =
                "CREATE TABLE IF NOT EXISTS " + dbName +
                "(id     INTEGER AUTO_INCREMENT PRIMARY KEY, " +
                " org    VARCHAR(100) NOT NULL, service VARCHAR(100) NOT NULL, " +
                " stream VARCHAR(4096) NOT NULL UNIQUE, delay INTEGER NOT NULL)";

        Statement stmt = null;
        try {
            stmt = conn.createStatement();
            stmt.executeUpdate(createString);
        } finally {
            if (stmt != null) {
                stmt.close();
            }
        }
    }

    class StreamInfo {
        public StreamInfo(int id, String org, String service, String stream, int delay) {
            this.id = id;
            this.org = org;
            this.service = service;
            this.stream = stream;
            this.delay = delay;
        }

        public int getId() {
            return id;
        }

        public void setId(int id) {
            this.id = id;
        }

        public String getOrg() {
            return org;
        }

        public void setOrg(String org) {
            this.org = org;
        }

        public String getService() {
            return service;
        }

        public void setService(String service) {
            this.service = service;
        }

        public String getStream() {
            return stream;
        }

        public void setStream(String stream) {
            this.stream = stream;
        }

        public int getDelay() {
            return delay;
        }

        public void setDelay(int delay) {
            this.delay = delay;
        }

        private int id;
        private String org;
        private String service;
        private String stream;
        private int delay;
    }

    class Resp {
        public Resp(int code, Object data) {
            this.code = code;
            this.data = data;
        }

        public int getCode() {
            return code;
        }

        public void setCode(int code) {
            this.code = code;
        }

        public Object getData() {
            return data;
        }

        public void setData(Object data) {
            this.data = data;
        }

        private int code;
        private Object data;
    }
}
