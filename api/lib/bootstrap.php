<?php

function tms_config()
{
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require dirname(__DIR__) . '/config.php';
    }
    return $cfg;
}

function tms_db()
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $c = tms_config();
    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $c['db_host'],
        $c['db_port'],
        $c['db_name']
    );
    $pdo = new PDO($dsn, $c['db_user'], $c['db_password'], array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ));
    return $pdo;
}

function tms_json_out($data, $code = 200)
{
    http_response_code($code);
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');
    if ($code === 204) {
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function tms_fail($message, $code = 400, $extra = array())
{
    $payload = array_merge(array('detail' => $message), $extra);
    if (is_array($message)) {
        $payload = $message;
        if (!isset($payload['detail'])) {
            $first = reset($message);
            $payload['detail'] = is_array($first) ? implode(' ', $first) : (string) $first;
        }
    }
    tms_json_out($payload, $code);
}

function tms_body()
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $cached = array();
    if (!empty($_POST)) {
        $cached = $_POST;
    }
    $raw = file_get_contents('php://input');
    if ($raw) {
        $json = json_decode($raw, true);
        if (is_array($json)) {
            $cached = array_merge($cached, $json);
        }
    }
    return $cached;
}

function tms_path()
{
    $uri = parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/', PHP_URL_PATH);
    $uri = rawurldecode($uri);
    if (preg_match('#/api(?:/index\\.php)?(/.*)$#i', $uri, $m)) {
        return $m[1];
    }
    $script = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '';
    if ($script && strpos($uri, $script) === 0) {
        $uri = substr($uri, strlen($script));
    }
    if ($uri === '' || $uri === false) {
        $uri = '/';
    }
    if ($uri[0] !== '/') {
        $uri = '/' . $uri;
    }
    return $uri;
}

function tms_b64url_encode($data)
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function tms_b64url_decode($data)
{
    $pad = strlen($data) % 4;
    if ($pad) {
        $data .= str_repeat('=', 4 - $pad);
    }
    return base64_decode(strtr($data, '-_', '+/'));
}

function tms_jwt_encode($payload)
{
    $header = tms_b64url_encode(json_encode(array('typ' => 'JWT', 'alg' => 'HS256')));
    $body = tms_b64url_encode(json_encode($payload));
    $sig = tms_b64url_encode(hash_hmac('sha256', $header . '.' . $body, tms_config()['jwt_secret'], true));
    return $header . '.' . $body . '.' . $sig;
}

function tms_jwt_decode($token)
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    $check = tms_b64url_encode(hash_hmac('sha256', $parts[0] . '.' . $parts[1], tms_config()['jwt_secret'], true));
    if (!hash_equals($check, $parts[2])) {
        return null;
    }
    $payload = json_decode(tms_b64url_decode($parts[1]), true);
    if (!is_array($payload) || empty($payload['exp']) || $payload['exp'] < time()) {
        return null;
    }
    return $payload;
}

function tms_password_verify($password, $encoded)
{
    $parts = explode('$', $encoded);
    if (count($parts) < 4) {
        return false;
    }
    list($algo, $iterations, $salt, $hash) = $parts;
    if ($algo === 'pbkdf2_sha256') {
        $calc = base64_encode(hash_pbkdf2('sha256', $password, $salt, (int) $iterations, 32, true));
        return hash_equals($hash, $calc);
    }
    if ($algo === 'pbkdf2_sha1') {
        $calc = base64_encode(hash_pbkdf2('sha1', $password, $salt, (int) $iterations, 20, true));
        return hash_equals($hash, $calc);
    }
    return false;
}

function tms_password_hash($password)
{
    $salt = substr(strtr(base64_encode(random_bytes(12)), '+', '.'), 0, 12);
    $iterations = 600000;
    $hash = base64_encode(hash_pbkdf2('sha256', $password, $salt, $iterations, 32, true));
    return 'pbkdf2_sha256$' . $iterations . '$' . $salt . '$' . $hash;
}

function tms_bearer()
{
    $header = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (!empty($headers['Authorization'])) {
            $header = $headers['Authorization'];
        }
    }
    if (stripos($header, 'Bearer ') === 0) {
        return trim(substr($header, 7));
    }
    return '';
}

function tms_current_user()
{
    static $user = false;
    if ($user !== false) {
        return $user;
    }
    $token = tms_bearer();
    if ($token === '') {
        $user = null;
        return null;
    }
    $payload = tms_jwt_decode($token);
    if (!$payload || empty($payload['user_id'])) {
        $user = null;
        return null;
    }
    $stmt = tms_db()->prepare('SELECT * FROM core_usuario WHERE id = ? LIMIT 1');
    $stmt->execute(array((int) $payload['user_id']));
    $row = $stmt->fetch();
    $user = $row ? tms_cast_row($row, 'core_usuario') : null;
    return $user;
}

function tms_require_auth()
{
    $user = tms_current_user();
    if (!$user || empty($user['is_active'])) {
        tms_fail('Autenticação obrigatória.', 401);
    }
    return $user;
}

function tms_role($user)
{
    return isset($user['role']) ? trim($user['role']) : '';
}

function tms_can_write_users($user)
{
    $role = tms_role($user);
    return $role === 'TI' || $role === 'Admin';
}

function tms_is_motorista_portal($user)
{
    $role = tms_role($user);
    return $role === 'Motorista' || $role === 'Ajudante';
}

function tms_now()
{
    $dt = new DateTime('now', new DateTimeZone('America/Sao_Paulo'));
    return $dt->format('Y-m-d H:i:s.u');
}

function tms_now_iso()
{
    $dt = new DateTime('now', new DateTimeZone('America/Sao_Paulo'));
    return $dt->format('c');
}

function tms_fmt_dt($value)
{
    if ($value === null || $value === '') {
        return null;
    }
    try {
        $dt = new DateTime($value);
        return $dt->format('c');
    } catch (Exception $e) {
        return $value;
    }
}

function tms_bool($value)
{
    if (is_bool($value)) {
        return $value;
    }
    return (int) $value === 1;
}

function tms_json_col($value)
{
    if ($value === null || $value === '') {
        return array();
    }
    if (is_array($value)) {
        return $value;
    }
    $decoded = json_decode($value, true);
    return is_array($decoded) ? $decoded : array();
}

function tms_int_or_null($value)
{
    if ($value === '' || $value === null) {
        return null;
    }
    return (int) $value;
}

function tms_float_or_null($value)
{
    if ($value === '' || $value === null) {
        return null;
    }
    return (float) $value;
}

function tms_empty_to_null($value)
{
    return $value === '' ? null : $value;
}

$TMS_BOOL_COLS = array(
    'is_superuser', 'is_staff', 'is_active', 'ativo', 'primeira_do_dia_diferente', 'cliente_gostou',
);
$TMS_JSON_COLS = array('dependentes', 'anexos', 'itens_adicionais');
$TMS_DT_COLS = array(
    'last_login', 'date_joined', 'criado_em', 'atualizado_em', 'ultima_emissao', 'data_hora',
    'saida_entrega', 'chegada_cliente', 'inicio_descarregamento', 'finalizado',
);

function tms_cast_row($row, $table = '')
{
    global $TMS_BOOL_COLS, $TMS_JSON_COLS, $TMS_DT_COLS;
    if (!is_array($row)) {
        return $row;
    }
    foreach ($row as $key => $value) {
        if (in_array($key, $TMS_BOOL_COLS, true)) {
            $row[$key] = tms_bool($value);
        } elseif (in_array($key, $TMS_JSON_COLS, true)) {
            $row[$key] = tms_json_col($value);
        } elseif (in_array($key, $TMS_DT_COLS, true)) {
            $row[$key] = tms_fmt_dt($value);
        } elseif (substr($key, -3) === '_id' && $value !== null) {
            $row[$key] = (int) $value;
        } elseif ($key === 'id' && $value !== null) {
            $row[$key] = (int) $value;
        }
    }
    return $row;
}

function tms_all($sql, $params = array())
{
    $stmt = tms_db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}

function tms_one($sql, $params = array())
{
    $stmt = tms_db()->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();
    return $row ? $row : null;
}

function tms_exec($sql, $params = array())
{
    $stmt = tms_db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function tms_columns($table)
{
    static $cache = array();
    if (isset($cache[$table])) {
        return $cache[$table];
    }
    $rows = tms_all('DESCRIBE `' . str_replace('`', '', $table) . '`');
    $cols = array();
    foreach ($rows as $row) {
        $cols[$row['Field']] = $row;
    }
    $cache[$table] = $cols;
    return $cols;
}

function tms_prepare_row($table, $data, $forUpdate = false)
{
    $cols = tms_columns($table);
    $out = array();
    foreach ($data as $key => $value) {
        if (!isset($cols[$key]) || $key === 'id') {
            continue;
        }
        if ($value === '') {
            $nullOk = (isset($cols[$key]['Null']) && $cols[$key]['Null'] === 'YES');
            $type = isset($cols[$key]['Type']) ? $cols[$key]['Type'] : '';
            if ($nullOk) {
                $value = null;
            } elseif (strpos($type, 'json') !== false) {
                $value = '[]';
            } elseif (strpos($type, 'int') !== false || strpos($type, 'double') !== false || strpos($type, 'decimal') !== false || strpos($type, 'float') !== false) {
                $value = 0;
            } else {
                $value = '';
            }
        }
        if (is_bool($value)) {
            $value = $value ? 1 : 0;
        }
        if (is_array($value)) {
            $value = json_encode($value, JSON_UNESCAPED_UNICODE);
        }
        $out[$key] = $value;
    }
    if (!$forUpdate) {
        foreach ($cols as $name => $meta) {
            if ($name === 'id' || isset($out[$name])) {
                continue;
            }
            $extra = isset($meta['Extra']) ? $meta['Extra'] : '';
            if (strpos($extra, 'auto_increment') !== false) {
                continue;
            }
            $default = $meta['Default'];
            if ($default !== null) {
                continue;
            }
            if ($meta['Null'] === 'YES') {
                continue;
            }
            $type = $meta['Type'];
            if (strpos($type, 'json') !== false) {
                $out[$name] = '[]';
            } elseif (strpos($type, 'int') !== false || strpos($type, 'tinyint') !== false) {
                $out[$name] = (strpos($name, 'is_') === 0 || $name === 'ativo') ? 1 : 0;
            } elseif (strpos($type, 'double') !== false || strpos($type, 'decimal') !== false || strpos($type, 'float') !== false) {
                $out[$name] = 0;
            } elseif (strpos($type, 'datetime') !== false) {
                $out[$name] = tms_now();
            } else {
                $out[$name] = '';
            }
        }
    }
    return $out;
}

function tms_insert($table, $data)
{
    $row = tms_prepare_row($table, $data, false);
    if (!$row) {
        tms_fail('Nenhum campo válido para inserir.', 400);
    }
    $cols = array_keys($row);
    $sql = 'INSERT INTO `' . $table . '` (`' . implode('`,`', $cols) . '`) VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')';
    tms_exec($sql, array_values($row));
    return (int) tms_db()->lastInsertId();
}

function tms_update($table, $id, $data)
{
    $row = tms_prepare_row($table, $data, true);
    if (!$row) {
        return;
    }
    $sets = array();
    $params = array();
    foreach ($row as $col => $value) {
        $sets[] = '`' . $col . '` = ?';
        $params[] = $value;
    }
    $params[] = (int) $id;
    tms_exec('UPDATE `' . $table . '` SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
}

function tms_delete($table, $id)
{
    tms_exec('DELETE FROM `' . $table . '` WHERE id = ?', array((int) $id));
}

function tms_get($table, $id)
{
    $row = tms_one('SELECT * FROM `' . $table . '` WHERE id = ? LIMIT 1', array((int) $id));
    return $row ? tms_cast_row($row, $table) : null;
}

function tms_user_name($user)
{
    if (!$user) {
        return '';
    }
    $nome = trim((isset($user['first_name']) ? $user['first_name'] : '') . ' ' . (isset($user['last_name']) ? $user['last_name'] : ''));
    return $nome !== '' ? $nome : (isset($user['username']) ? $user['username'] : '');
}

function tms_user_by_id($id)
{
    if (!$id) {
        return null;
    }
    $row = tms_one('SELECT * FROM core_usuario WHERE id = ? LIMIT 1', array((int) $id));
    return $row ? tms_cast_row($row, 'core_usuario') : null;
}

function tms_public_user($user)
{
    if (!$user) {
        return null;
    }
    return array(
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'first_name' => $user['first_name'],
        'last_name' => $user['last_name'],
        'email' => $user['email'],
        'role' => $user['role'],
        'telefone' => $user['telefone'],
        'is_active' => tms_bool($user['is_active']),
    );
}

function tms_tokens_for($user)
{
    $cfg = tms_config();
    $now = time();
    $access = tms_jwt_encode(array(
        'token_type' => 'access',
        'exp' => $now + $cfg['access_ttl'],
        'iat' => $now,
        'jti' => bin2hex(random_bytes(8)),
        'user_id' => (int) $user['id'],
    ));
    $refresh = tms_jwt_encode(array(
        'token_type' => 'refresh',
        'exp' => $now + $cfg['refresh_ttl'],
        'iat' => $now,
        'jti' => bin2hex(random_bytes(8)),
        'user_id' => (int) $user['id'],
    ));
    return array(
        'access' => $access,
        'refresh' => $refresh,
        'user' => tms_public_user($user),
    );
}
