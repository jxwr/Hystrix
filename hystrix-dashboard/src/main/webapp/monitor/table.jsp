<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hystrix Monitor</title>
    <link rel="stylesheet" href="https://build.golang.org/static/style.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/balloon-css/0.2.4/balloon.min.css">
    <style>
        label {
            padding: 0.5em;
        }
        table {
            min-width:48%;
        }
        ul {
            list-style-type: none;
            margin: 0px;
            padding: 0px;
        }
        .build .result {
            text-align: center;
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
        .build .stream {
            font-size: 8px;
            min-width: 600px;
        }
        .build .service {
            min-width: 100px;
        }
        table.streams {
            border: 1px solid #E0EBF5;
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
    <div id="table_page"></div>
    <script src="../dashboard/dist/bundle.js?ver=<%= System.currentTimeMillis()/10000 %>>"></script>
</body>
</html>