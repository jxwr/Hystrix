<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hystrix Monitor</title>
    <link rel="stylesheet" href="../css/golang-build.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/balloon-css/0.2.4/balloon.min.css">
    <style>
        .build .result {
            text-align: center;
            width: 1em;
            font-family: monospace;
        }
        .build .stream {
            min-width: 800px;
        }
        .build td, .build th {
            font-size: 9pt;
        }
        .streams th:nth-child(2) {
            min-width: 80px;
        }
        .streams th:nth-child(3) {
            min-width: 140px;
        }
        .streams th:nth-child(4) {
            min-width: 750px;
        }
        #streams_page { min-height: 3000px; }
    </style>
</head>
<body>
    <header id="topbar">
        <h1>Hystrix Monitor</h1>
        <div class="clear"></div>
    </header>
    <div id="streams_page"></div>
    <script src="../dashboard/dist/bundle.js?ver=<%= System.currentTimeMillis() %>>"></script>
</body>
</html>