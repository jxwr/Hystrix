<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hystrix Monitor</title>
    <link rel="stylesheet" href="https://build.golang.org/static/style.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/balloon-css/0.2.4/balloon.min.css">
    <style>
        .build .result {
            text-align: right;
            width: 1em;
            font-family: monospace;
        }
        .build td, .build th {
            font-size: 9pt;
        }
        .build .arch {
            text-align: center;
            cursor: pointer;
        }
        .fail {
            color: white;
            background-color: red;
            text-decoration: underline;
        }
        .underline {
            font-weight: bold;
            text-decoration: underline;
            background-color: #E0EBF5;
        }
        .green { color: green; }
        .blue { color: blue; }
        .lightSeaGreen { color: lightSeaGreen; }
        .gold { color: darkorange; }
        .purple { color: purple; }
        .purple { color: purple; }
        .red { color: red; }
    </style>
</head>
<body>
    <header id="topbar">
        <h1>Hystrix Monitor</h1>
        <div class="clear"></div>
    </header>
    <div id="page"></div>
    <script src="../dashboard/dist/bundle.js?ver=<%= System.currentTimeMillis() %>>"></script>
</body>
</html>