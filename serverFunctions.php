<?php
function caesar($s, $offset) {
    $chars = str_split("g3b2k1j0h4d9e8f7c6a5lqzxywvutsirponm");
    $new = str_split($s);
    for ($i = 0; $i < count($new); $i++) {
        $index = array_search($new[$i], $chars);
        $new[$i] = $chars[($index + $offset + count($chars)) % count($chars)];
    }
    return implode("", $new);
}


if (isset($_POST['saveTo'])) {
    // save file on server
    
    // get id or generate id
    $id = $_POST['saveTo'];
    if ($id == "") {
        $chars = str_split("abcdefghijklmnopqrstuvwxyz0123456789");
        for ($i=0;$i<16;$i++) {
            $id .= $chars[array_rand($chars)];
        }
    }

    // return value
    $ret = array();
    
    if ($_POST['accessKey'] == caesar($id, 5) || ($_POST['saveTo'] == "" && $_POST['accessKey'] == "")) {
        if (file_exists("savedBibs/" . $id . ".json")) {
            if (json_encode(json_decode(file_get_contents("savedBibs/" . $_POST['loadFrom'] . ".json", true))) != json_encode(json_decode($_POST['data']))) {
                rename("savedBibs/" . $id . ".json", "savedBibs/" . $id . "_".date("Y-m-d_H-i").".json");
            }
        }
        // save the file
        file_put_contents("savedBibs/" . $id . ".json", json_encode(json_decode($_POST['data']), JSON_PRETTY_PRINT));

        $ret['message'] = "file saved";
        $ret['data'] = array($id, $_POST['accessKey']);
        if ($_POST['saveTo'] == "") {
            $ret['data'][1] = caesar($id, 5);
        }
    } else {
        $ret['message'] = "You don't have write permissions to save the file.";
        $ret['data'] = array($id, "");
    }
    echo json_encode($ret);
} else if (isset($_POST['loadFrom'])) {
    $ret = array();

    if (file_exists("savedBibs/" . $_POST['loadFrom'] . ".json")) {
        if ($_POST['loadFrom'] == caesar($_POST['accessKey'], -5)) {
            $ret['payload'] = json_decode(file_get_contents("savedBibs/" . $_POST['loadFrom'] . ".json"), true);
            $ret['message'] = "file loaded";
            $ret['data'] = array($_POST['loadFrom'], $_POST['accessKey']);
        } else {
            $ret['payload'] = json_decode(file_get_contents("savedBibs/" . $_POST['loadFrom'] . ".json"), true);
            if ($_POST['accessKey'] == "") {
                $ret['message'] = "File loaded in read-only mode";
            } else {
                $ret['message'] = "Access key incorrect, file loaded in read-only mode";
            }
            if ($_POST['saveTo'] == "") {
                $ret['data'] = array($_POST['loadFrom'], "");
            } else {
                $ret['data'] = array($_POST['loadFrom'], "");
            }
        }
    } else {
        $ret['payload'] = array();
        $ret['message'] = "File not found :-()";
        $ret['data'] = array($_POST['loadFrom'], "");
    }
    echo json_encode($ret);
}


?>
