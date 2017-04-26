package com.netflix.hystrix.dashboard.stream;

import com.google.gson.Gson;
import org.apache.http.HttpResponse;
import org.apache.http.HttpStatus;
import org.apache.http.client.HttpClient;
import org.apache.http.client.methods.HttpGet;
import org.apache.http.impl.client.DefaultHttpClient;
import org.apache.http.impl.conn.PoolingClientConnectionManager;
import org.apache.http.params.HttpConnectionParams;
import org.apache.http.params.HttpParams;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ConcurrentHashMap;

import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
import javax.websocket.*;
import javax.websocket.server.ServerContainer;
import javax.websocket.server.ServerEndpoint;

/**
 * ProxyStreamServlet websocket version
 */
@ServerEndpoint("/ws/stream/proxy")
public class WsProxyStreamServlet implements ServletContextListener {
    private ConcurrentHashMap<String, Boolean> sessionMap = new ConcurrentHashMap<String, Boolean>();

    private static final Logger logger = LoggerFactory.getLogger(WsProxyStreamServlet.class);

    public WsProxyStreamServlet() {
    }

    @Override
    public void contextInitialized(ServletContextEvent servletContextEvent) {
        final ServerContainer serverContainer = (ServerContainer) servletContextEvent.getServletContext()
                .getAttribute("javax.websocket.server.ServerContainer");

        try {
            serverContainer.addEndpoint(WsProxyStreamServlet.class);
        } catch (DeploymentException e) {
            logger.error(e.getMessage());
            e.printStackTrace();
        }
    }

    @Override
    public void contextDestroyed(ServletContextEvent sce) {
    }

    @OnOpen
    public void onOpen(Session session){
        logger.info(session.getId() + " has opened a connection");
        sessionMap.put(session.getId(), false);
    }

    @OnMessage
    public void onMessage(String message, Session session) {
        logger.info("Message from " + session.getId() + ": " + message);
        try {
            Boolean started = sessionMap.get(session.getId());
            if (!started) {
                Gson gson = new Gson();
                StreamInfoMessage msg = gson.fromJson(message, StreamInfoMessage.class);

                writeEventStream(session, msg);
            }
        } catch (Exception e) {
            logger.error("Error from " + session.getId() + ": " + e.getMessage());
        }
    }

    @OnClose
    public void onClose(Session session){
        logger.info("Session " +session.getId()+" has ended");
    }

    protected void writeEventStream(Session session, StreamInfoMessage msg) {
        String origin = msg.getOrigin().trim();

        HttpGet httpget = null;
        InputStream is = null;
        boolean hasFirstParameter = false;
        StringBuilder url = new StringBuilder();
        if (!origin.startsWith("http")) {
            url.append("http://");
        }
        url.append(origin);
        String proxyUrl = url.toString();

        logger.info("\n\nProxy opening connection to: {}\n\n", proxyUrl);
        try {
            httpget = new HttpGet(proxyUrl);
            HttpClient client = ProxyConnectionManager.httpClient;
            HttpResponse httpResponse = client.execute(httpget);
            int statusCode = httpResponse.getStatusLine().getStatusCode();
            logger.info("statusCode:" + statusCode);
            if (statusCode == HttpStatus.SC_OK) {
                // writeTo swallows exceptions and never quits even if outputstream is throwing IOExceptions (such as broken pipe) ... since the inputstream is infinite
                // httpResponse.getEntity().writeTo(new OutputStreamWrapper(response.getOutputStream()));
                // so I copy it manually ...
                is = httpResponse.getEntity().getContent();

                sessionMap.put(session.getId(), true);

                // copy data from source to response
                StringBuilder sb = new StringBuilder(2048);
                int b = -1;
                while ((b = is.read()) != -1) {
                    try {
                        sb.append((char)b);
                        if (b == 10 /** flush buffer on line feed */) {
                            String s = sb.toString();
                            if (s.startsWith("data: ")) {
                                session.getBasicRemote().sendText(sb.toString());
                            }
                            sb = new StringBuilder(2048);
                        }
                    } catch (Exception e) {
                        if (e.getClass().getSimpleName().equalsIgnoreCase("ClientAbortException")) {
                            // don't throw an exception as this means the user closed the connection
                            logger.debug("Connection closed by client. Will stop proxying ...");
                            // break out of the while loop
                            break;
                        } else {
                            // received unknown error while writing so throw an exception
                            throw new RuntimeException(e);
                        }
                    }
                }
            }
        } catch (Exception e) {
            logger.error("Error proxying request: " + url, e);
        } finally {
            if (httpget != null) {
                try {
                    httpget.abort();
                } catch (Exception e) {
                    logger.error("failed aborting proxy connection.", e);
                }
            }

            // httpget.abort() MUST be called first otherwise is.close() hangs (because data is still streaming?)
            if (is != null) {
                // this should already be closed by httpget.abort() above
                try {
                    is.close();
                } catch (Exception e) {
                    // e.printStackTrace();
                }
            }
        }
    }

    private static class StreamInfoMessage {
        public StreamInfoMessage(String origin, int delay) {
            this.origin = origin;
            this.delay = delay;
        }

        public int getDelay() {
            return delay;
        }

        public void setDelay(int delay) {
            this.delay = delay;
        }

        public String getOrigin() {
            return origin;
        }

        public void setOrigin(String origin) {
            this.origin = origin;
        }

        private String origin;
        private int delay;
    }

    private static class ProxyConnectionManager {
        private final static PoolingClientConnectionManager threadSafeConnectionManager = new PoolingClientConnectionManager();
        private final static HttpClient httpClient = new DefaultHttpClient(threadSafeConnectionManager);

        static {
            logger.debug("Initialize ProxyConnectionManager");
            /* common settings */
            HttpParams httpParams = httpClient.getParams();
            HttpConnectionParams.setConnectionTimeout(httpParams, 5000);
            HttpConnectionParams.setSoTimeout(httpParams, 10000);

            /* number of connections to allow */
            threadSafeConnectionManager.setDefaultMaxPerRoute(400);
            threadSafeConnectionManager.setMaxTotal(400);
        }
    }
}