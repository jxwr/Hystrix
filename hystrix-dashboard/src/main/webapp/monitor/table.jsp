<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Hystrix Monitor</title>
    <link rel="stylesheet" href="../dashboard/node_modules/react-table/react-table.css">
    <link rel="stylesheet" type="text/css" href="https://build.golang.org/static/style.css"/>
    <style>
        .fail {
            color: white;
            background-color: red;
            text-decoration: underline;
        }
        .underline {
            font-weight: bold;
            text-decoration: underline;
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