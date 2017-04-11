<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hystrix Monitor</title>
    <link rel="stylesheet" href="https://build.golang.org/static/style.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/balloon-css/0.2.4/balloon.min.css">
    <style>
        .build .result {
            text-align: center;
            width: 1em;
            font-family: monospace;
        }
        .build .stream {
            font-size: 8px;
            min-width: 800px;
        }
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