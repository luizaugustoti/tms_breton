<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

http_response_code(503);
echo json_encode(array(
    'detail' => 'A API Django do TMS nao esta no ar neste servidor. O HTML em /frontend nao autentica sozinho. No cPanel use Setup Python App na pasta api (passenger_wsgi.py) e envie tambem a pasta backend. No PC use iniciar_tms.bat e abra http://127.0.0.1:8002/',
), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
