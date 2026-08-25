<?php
error_reporting(E_ALL);
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/serializers.php';

try {
    tms_dispatch();
} catch (PDOException $e) {
    tms_fail('Erro de banco de dados: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    tms_fail($e->getMessage(), 500);
}

function tms_dispatch()
{
    $method = isset($_SERVER['REQUEST_METHOD']) ? strtoupper($_SERVER['REQUEST_METHOD']) : 'GET';
    $path = rtrim(tms_path(), '/');
    if ($path === '') {
        $path = '/';
    }

    if ($path === '/v1/health' || $path === '/') {
        tms_json_out(array('ok' => true, 'engine' => 'php', 'name' => 'TMS Breton API'));
    }

    if ($path === '/v1/auth/login' && $method === 'POST') {
        tms_handle_auth_login();
    }
    if ($path === '/v1/auth/token/refresh' && $method === 'POST') {
        tms_handle_auth_refresh();
    }

    $user = tms_require_auth();

    if (preg_match('#^/v1/cadastros/veiculos(?:/(\d+))?$#', $path, $m)) {
        tms_rest('cadastros_veiculo', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_veiculo', $user, 'modelo', function ($body) {
            if (!empty($body['placa'])) {
                $body['placa'] = strtoupper(trim($body['placa']));
            }
            if (isset($body['equipe'])) {
                $body['equipe_id'] = $body['equipe'];
            }
            if (isset($body['motorista'])) {
                $body['motorista_id'] = $body['motorista'];
            }
            if (!empty($body['tipo_proprietario']) && strtolower($body['tipo_proprietario']) === 'terceiro') {
                $body['tipo_frota'] = 'TERCEIRO';
            } elseif (!empty($body['tipo_proprietario'])) {
                $body['tipo_frota'] = 'PROPRIA';
            }
            if (empty($body['ano']) && !empty($body['ano_modelo'])) {
                $body['ano'] = $body['ano_modelo'];
            }
            return $body;
        });
    }

    if (preg_match('#^/v1/cadastros/equipes(?:/(\d+))?$#', $path, $m)) {
        tms_rest('cadastros_equipe', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_equipe', $user, 'nome', function ($body) {
            if (isset($body['motorista'])) {
                $body['motorista_id'] = $body['motorista'];
            }
            return $body;
        });
    }

    if (preg_match('#^/v1/cadastros/(?:funcionarios|motoristas)(?:/(\d+))?$#', $path, $m)) {
        if (in_array($method, array('POST', 'PUT', 'PATCH', 'DELETE'), true) && !tms_can_write_users($user)) {
            tms_fail('Sem permissão para alterar cadastros de funcionários.', 403);
        }
        tms_rest('cadastros_funcionario', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_funcionario', $user, 'nome', function ($body) {
            if (isset($body['usuario'])) {
                $body['usuario_id'] = $body['usuario'];
            }
            return $body;
        });
    }

    if (preg_match('#^/v1/cadastros/(?:pessoas|clientes)(?:/(\d+))?$#', $path, $m)) {
        if ($method === 'GET' && empty($m[1])) {
            foreach (tms_all('SELECT loja, cliente, cnpj_cpf, endereco, bairro, cidade, uf, cep FROM pedidos_pedido') as $pedido) {
                tms_upsert_pessoa(array(
                    'nome' => $pedido['loja'],
                    'papel' => 'REMETENTE',
                    'increment' => false,
                    'origem' => 'EMISSAO',
                ));
                tms_upsert_pessoa(array(
                    'nome' => $pedido['cliente'],
                    'documento' => $pedido['cnpj_cpf'],
                    'endereco' => $pedido['endereco'],
                    'complemento' => $pedido['bairro'],
                    'cidade' => $pedido['cidade'],
                    'uf' => $pedido['uf'],
                    'cep' => $pedido['cep'],
                    'papel' => 'DESTINATARIO',
                    'increment' => false,
                    'origem' => 'EMISSAO',
                ));
            }
        }
        tms_rest('cadastros_pessoaempresa', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_pessoa', $user, 'nome', function ($body) {
            if (!empty($body['documento'])) {
                $body['documento_digits'] = tms_digits($body['documento']);
            }
            if (!empty($body['uf'])) {
                $body['uf'] = strtoupper($body['uf']);
            }
            if (empty($body['origem'])) {
                $body['origem'] = 'MANUAL';
            }
            if (empty($body['tipo']) && !empty($body['documento_digits'])) {
                $body['tipo'] = strlen($body['documento_digits']) === 11 ? 'FISICA' : 'JURIDICA';
            }
            return $body;
        });
    }

    if (preg_match('#^/v1/cadastros/usuarios(?:/(\d+))?$#', $path, $m)) {
        tms_handle_usuarios($method, isset($m[1]) ? $m[1] : null, $user);
    }

    if (preg_match('#^/v1/estoque(?:/produtos)?(?:/(\d+))?$#', $path, $m) && strpos($path, 'movimentacoes') === false) {
        tms_rest('estoque_produtoestoque', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_produto', $user, 'nome', function ($body) {
            if (isset($body['codigo']) && !isset($body['codigo_sku'])) {
                $body['codigo_sku'] = $body['codigo'];
            }
            if (isset($body['descricao']) && !isset($body['nome'])) {
                $body['nome'] = $body['descricao'];
            }
            return $body;
        });
    }

    if (preg_match('#^/v1/estoque/movimentacoes(?:/(\d+))?$#', $path, $m)) {
        if ($method === 'POST') {
            $body = tms_body();
            if (isset($body['produto'])) {
                $body['produto_id'] = $body['produto'];
            }
            $id = tms_insert('estoque_movimentacaoestoque', $body);
            $mov = tms_get('estoque_movimentacaoestoque', $id);
            $produto = tms_get('estoque_produtoestoque', $mov['produto_id']);
            if ($produto) {
                $qtd = (float) $produto['quantidade'];
                if ($mov['tipo'] === 'entrada') {
                    $qtd += (float) $mov['quantidade'];
                } elseif ($mov['tipo'] === 'saida') {
                    $qtd -= (float) $mov['quantidade'];
                } elseif ($mov['tipo'] === 'ajuste') {
                    $qtd = (float) $mov['quantidade'];
                }
                tms_update('estoque_produtoestoque', $produto['id'], array('quantidade' => $qtd));
            }
            tms_json_out(tms_serialize_movimentacao($mov), 201);
        }
        tms_rest('estoque_movimentacaoestoque', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_movimentacao', $user, 'id DESC');
    }

    if ($path === '/v1/pedidos/importa-nota' && $method === 'POST') {
        tms_handle_importa_nota();
    }

    if (preg_match('#^/v1/pedidos(?:/(\d+))?$#', $path, $m)) {
        tms_handle_pedidos($method, isset($m[1]) ? $m[1] : null);
    }

    if (preg_match('#^/v1/roteirizacao/rotas/(\d+)/adicionar_pedidos$#', $path, $m) && $method === 'POST') {
        tms_handle_adicionar_pedidos((int) $m[1]);
    }

    if (preg_match('#^/v1/roteirizacao/rotas(?:/(\d+))?$#', $path, $m)) {
        tms_handle_rotas($method, isset($m[1]) ? $m[1] : null);
    }

    if (preg_match('#^/v1/roteirizacao/paradas/remover-por-pedido$#', $path) && $method === 'POST') {
        $body = tms_body();
        $pedidoId = isset($body['pedido_id']) ? $body['pedido_id'] : null;
        if (!$pedidoId) {
            tms_fail('ID do pedido não informado.', 400);
        }
        $parada = tms_one('SELECT * FROM roteirizacao_paradarota WHERE pedido_id = ? LIMIT 1', array((int) $pedidoId));
        if (!$parada) {
            tms_fail('Parada não encontrada para este pedido.', 404);
        }
        tms_delete('roteirizacao_paradarota', $parada['id']);
        tms_json_out(array('status' => 'Pedido removido da rota com sucesso.'));
    }

    if (preg_match('#^/v1/roteirizacao/paradas/(\d+)/(atualizar_status|atualizar-status|atualizar-status-motorista|alterar-status-gestor)$#', $path, $m) && in_array($method, array('POST', 'PATCH'), true)) {
        tms_atualizar_parada_status((int) $m[1], tms_body(), $user);
    }

    if (preg_match('#^/v1/roteirizacao/paradas(?:/(\d+))?$#', $path, $m)) {
        tms_rest('roteirizacao_paradarota', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_parada', $user, 'id');
    }

    if (preg_match('#^/v1/roteirizacao/pedidos/(\d+)/mover$#', $path, $m) && $method === 'PATCH') {
        tms_handle_mover_pedido((int) $m[1]);
    }

    if ($path === '/v1/roteirizacao/publicar' && $method === 'POST') {
        tms_json_out(array('message' => 'Rotas publicadas com sucesso para os motoristas!', 'status' => 'published'));
    }

    if ($path === '/v1/roteirizacao/motorista/entregas' && $method === 'GET') {
        tms_handle_motorista_entregas($user);
    }

    if ($path === '/v1/satisfacao/resumo' || $path === '/v1/satisfacao/nps-resumo') {
        tms_handle_nps_resumo();
    }
    if ($path === '/v1/satisfacao/avaliacoes' && $method === 'GET') {
        tms_json_out(tms_list_map('SELECT * FROM satisfacao_avaliacaonps ORDER BY criado_em DESC', array(), 'tms_serialize_nps'));
    }
    if (preg_match('#^/v1/satisfacao(?:/(\d+))?$#', $path, $m)) {
        tms_rest('satisfacao_avaliacaonps', $method, isset($m[1]) ? $m[1] : null, 'tms_serialize_nps', $user, 'criado_em DESC');
    }

    if ($path === '/v1/indicadores/metrics' || $path === '/v1/indicadores/dashboard') {
        tms_handle_metrics();
    }

    if ($path === '/v1/ocorrencias' && $method === 'POST') {
        tms_json_out(array('ok' => true), 201);
    }

    tms_fail('Rota não encontrada.', 404);
}

function tms_rest($table, $method, $id, $serializer, $user, $order, $prepare = null)
{
    if ($id) {
        $row = tms_get($table, $id);
        if (!$row) {
            tms_fail('Registro não encontrado.', 404);
        }
        if ($method === 'GET') {
            tms_json_out(call_user_func($serializer, $row));
        }
        if ($method === 'DELETE') {
            tms_delete($table, $id);
            tms_json_out(null, 204);
        }
        if ($method === 'PATCH' || $method === 'PUT') {
            $body = tms_body();
            if ($prepare) {
                $body = call_user_func($prepare, $body);
            }
            tms_update($table, $id, $body);
            tms_json_out(call_user_func($serializer, tms_get($table, $id)));
        }
        tms_fail('Método não permitido.', 405);
    }
    if ($method === 'GET') {
        $orderSql = strpos($order, ' ') !== false ? $order : ($order . ' ASC');
        tms_json_out(tms_list_map('SELECT * FROM `' . $table . '` ORDER BY ' . $orderSql, array(), $serializer));
    }
    if ($method === 'POST') {
        $body = tms_body();
        if ($prepare) {
            $body = call_user_func($prepare, $body);
        }
        $newId = tms_insert($table, $body);
        tms_json_out(call_user_func($serializer, tms_get($table, $newId)), 201);
    }
    tms_fail('Método não permitido.', 405);
}

function tms_handle_usuarios($method, $id, $user)
{
    if (in_array($method, array('POST', 'PUT', 'PATCH', 'DELETE'), true) && !tms_can_write_users($user)) {
        tms_fail('Sem permissão para gerenciar usuários.', 403);
    }
    if ($id) {
        $row = tms_get('core_usuario', $id);
        if (!$row) {
            tms_fail('Registro não encontrado.', 404);
        }
        if ($method === 'GET') {
            tms_json_out(tms_serialize_usuario($row));
        }
        if ($method === 'DELETE') {
            tms_delete('core_usuario', $id);
            tms_json_out(null, 204);
        }
        if ($method === 'PATCH' || $method === 'PUT') {
            tms_json_out(tms_serialize_usuario(tms_save_usuario(tms_body(), $row)));
        }
        tms_fail('Método não permitido.', 405);
    }
    if ($method === 'GET') {
        tms_json_out(tms_list_map('SELECT * FROM core_usuario ORDER BY first_name', array(), 'tms_serialize_usuario'));
    }
    if ($method === 'POST') {
        tms_json_out(tms_serialize_usuario(tms_save_usuario(tms_body(), null)), 201);
    }
    tms_fail('Método não permitido.', 405);
}

function tms_save_usuario($body, $instance)
{
    $email = strtolower(trim(isset($body['email']) ? $body['email'] : ($instance ? $instance['email'] : '')));
    if ($email === '') {
        tms_fail(array('email' => 'O e-mail é obrigatório.'), 400);
    }
    $sql = 'SELECT id FROM core_usuario WHERE email = ?';
    $params = array($email);
    if ($instance) {
        $sql .= ' AND id <> ?';
        $params[] = $instance['id'];
    }
    if (tms_one($sql . ' LIMIT 1', $params)) {
        tms_fail(array('email' => 'Já existe um usuário com este e-mail.'), 400);
    }
    $perfil = isset($body['perfil']) ? $body['perfil'] : ($instance ? $instance['role'] : 'Operacional');
    $funcionarioId = isset($body['funcionario']) ? $body['funcionario'] : null;
    if (!$funcionarioId && in_array($perfil, array('Motorista', 'Ajudante'), true) && !$instance) {
        tms_fail(array('funcionario' => 'Motorista e Ajudante precisam estar vinculados a um funcionário.'), 400);
    }
    $data = array(
        'username' => $email,
        'email' => $email,
        'first_name' => isset($body['nome']) ? $body['nome'] : (isset($body['first_name']) ? $body['first_name'] : ($instance ? $instance['first_name'] : '')),
        'role' => $perfil,
        'is_active' => array_key_exists('ativo', $body) ? ($body['ativo'] ? 1 : 0) : ($instance ? ($instance['is_active'] ? 1 : 0) : 1),
        'telefone' => isset($body['telefone']) ? $body['telefone'] : ($instance ? $instance['telefone'] : null),
    );
    if (!empty($body['senha'])) {
        $data['password'] = tms_password_hash($body['senha']);
    } elseif (!$instance) {
        $data['password'] = tms_password_hash(bin2hex(random_bytes(8)));
    }
    if (!$instance) {
        $data['last_name'] = '';
        $data['is_superuser'] = 0;
        $data['is_staff'] = 0;
        $data['date_joined'] = tms_now();
        $data['status_operacional'] = 'Ativo';
        $id = tms_insert('core_usuario', $data);
        $user = tms_get('core_usuario', $id);
    } else {
        tms_update('core_usuario', $instance['id'], $data);
        $user = tms_get('core_usuario', $instance['id']);
    }
    if ($funcionarioId) {
        tms_update('cadastros_funcionario', $funcionarioId, array('usuario_id' => $user['id']));
    }
    if ($perfil === 'Motorista') {
        tms_get_or_create_equipe($user['id']);
    }
    return $user;
}

function tms_handle_pedidos($method, $id)
{
    if ($id) {
        $row = tms_get('pedidos_pedido', $id);
        if (!$row) {
            tms_fail('Registro não encontrado.', 404);
        }
        if ($method === 'GET') {
            tms_json_out(tms_serialize_pedido($row));
        }
        if ($method === 'DELETE') {
            tms_exec('DELETE FROM pedidos_itempedido WHERE pedido_id = ?', array((int) $id));
            tms_exec('DELETE FROM roteirizacao_paradarota WHERE pedido_id = ?', array((int) $id));
            tms_delete('pedidos_pedido', $id);
            tms_json_out(null, 204);
        }
        if ($method === 'PATCH' || $method === 'PUT') {
            $body = tms_body();
            $payload = tms_pedido_payload($body);
            tms_update('pedidos_pedido', $id, $payload);
            $pedido = tms_get('pedidos_pedido', $id);
            if (isset($body['itens'])) {
                tms_replace_itens($pedido, $body['itens'], true);
                $pedido = tms_get('pedidos_pedido', $id);
            }
            tms_registrar_pessoas_pedido($pedido, $body);
            tms_garantir_backlog($pedido);
            tms_json_out(tms_serialize_pedido(tms_get('pedidos_pedido', $id)));
        }
        tms_fail('Método não permitido.', 405);
    }
    if ($method === 'GET') {
        tms_json_out(tms_list_map('SELECT * FROM pedidos_pedido ORDER BY criado_em DESC', array(), 'tms_serialize_pedido'));
    }
    if ($method === 'POST') {
        $body = tms_body();
        $payload = tms_pedido_payload($body);
        if (empty($payload['numero_nota'])) {
            tms_fail(array('numero_nota' => 'A nota fiscal é obrigatória.'), 400);
        }
        $payload['numero_nota'] = trim($payload['numero_nota']);
        $existente = tms_one('SELECT * FROM pedidos_pedido WHERE numero_nota = ? LIMIT 1', array($payload['numero_nota']));
        if ($existente) {
            tms_update('pedidos_pedido', $existente['id'], $payload);
            $pedido = tms_get('pedidos_pedido', $existente['id']);
            tms_replace_itens($pedido, isset($body['itens']) ? $body['itens'] : array(), true);
        } else {
            if (empty($payload['status'])) {
                $payload['status'] = 'Pendente';
            }
            if (empty($payload['tipo_operacao'])) {
                $payload['tipo_operacao'] = 'ENTREGA';
            }
            $payload['criado_em'] = tms_now();
            $newId = tms_insert('pedidos_pedido', $payload);
            $pedido = tms_get('pedidos_pedido', $newId);
            tms_replace_itens($pedido, isset($body['itens']) ? $body['itens'] : array(), false);
        }
        $pedido = tms_get('pedidos_pedido', $pedido['id']);
        tms_registrar_pessoas_pedido($pedido, $body);
        tms_garantir_backlog($pedido);
        tms_json_out(tms_serialize_pedido(tms_get('pedidos_pedido', $pedido['id'])), $existente ? 200 : 201);
    }
    tms_fail('Método não permitido.', 405);
}

function tms_handle_rotas($method, $id)
{
    if ($id) {
        $row = tms_get('roteirizacao_rota', $id);
        if (!$row) {
            tms_fail('Registro não encontrado.', 404);
        }
        if ($method === 'GET') {
            tms_json_out(tms_serialize_rota($row));
        }
        if ($method === 'DELETE') {
            tms_exec('DELETE FROM roteirizacao_paradarota WHERE rota_id = ?', array((int) $id));
            tms_delete('roteirizacao_rota', $id);
            tms_json_out(null, 204);
        }
        if ($method === 'PATCH' || $method === 'PUT') {
            $body = tms_body();
            if (isset($body['veiculo'])) {
                $body['veiculo_id'] = $body['veiculo'];
            }
            if (isset($body['equipe'])) {
                $body['equipe_id'] = $body['equipe'];
            }
            if (isset($body['motorista'])) {
                $body['motorista_id'] = $body['motorista'];
            }
            if (isset($body['ajudante'])) {
                $body['ajudante_id'] = $body['ajudante'];
            }
            if (!empty($body['motorista_id']) && empty($body['equipe_id']) && empty($row['equipe_id'])) {
                $equipe = tms_get_or_create_equipe($body['motorista_id']);
                $body['equipe_id'] = $equipe['id'];
            }
            $body['atualizado_em'] = tms_now();
            tms_update('roteirizacao_rota', $id, $body);
            tms_json_out(tms_serialize_rota(tms_get('roteirizacao_rota', $id)));
        }
        tms_fail('Método não permitido.', 405);
    }
    if ($method === 'GET') {
        tms_json_out(tms_list_map('SELECT * FROM roteirizacao_rota ORDER BY data_rota DESC, id DESC', array(), 'tms_serialize_rota'));
    }
    if ($method === 'POST') {
        $body = tms_body();
        if (isset($body['veiculo'])) {
            $body['veiculo_id'] = $body['veiculo'];
        }
        if (isset($body['equipe'])) {
            $body['equipe_id'] = $body['equipe'];
        }
        if (isset($body['motorista'])) {
            $body['motorista_id'] = $body['motorista'];
        }
        if (isset($body['ajudante'])) {
            $body['ajudante_id'] = $body['ajudante'];
        }
        if (!empty($body['motorista_id']) && empty($body['equipe_id'])) {
            $equipe = tms_get_or_create_equipe($body['motorista_id']);
            $body['equipe_id'] = $equipe['id'];
        }
        $body['criado_em'] = tms_now();
        $body['atualizado_em'] = tms_now();
        $newId = tms_insert('roteirizacao_rota', $body);
        tms_json_out(tms_serialize_rota(tms_get('roteirizacao_rota', $newId)), 201);
    }
    tms_fail('Método não permitido.', 405);
}

function tms_handle_adicionar_pedidos($rotaId)
{
    $rota = tms_get('roteirizacao_rota', $rotaId);
    if (!$rota) {
        tms_fail('Rota não encontrada.', 404);
    }
    $body = tms_body();
    $ids = isset($body['pedido_ids']) ? $body['pedido_ids'] : array();
    if (!$ids) {
        tms_fail('Nenhum ID de pedido foi enviado.', 400);
    }
    $seqRow = tms_one('SELECT COALESCE(MAX(sequencia),0) AS s FROM roteirizacao_paradarota WHERE rota_id = ?', array($rotaId));
    $seq = (int) $seqRow['s'];
    $motoristaId = $rota['motorista_id'];
    if (!$motoristaId && $rota['equipe_id']) {
        $equipe = tms_get('cadastros_equipe', $rota['equipe_id']);
        $motoristaId = $equipe ? $equipe['motorista_id'] : null;
    }
    $adicionados = 0;
    foreach ($ids as $pId) {
        $pedido = tms_get('pedidos_pedido', $pId);
        if (!$pedido) {
            continue;
        }
        $existe = tms_one('SELECT id FROM roteirizacao_paradarota WHERE rota_id = ? AND pedido_id = ? LIMIT 1', array($rotaId, (int) $pId));
        if (!$existe) {
            $seq++;
            tms_insert('roteirizacao_paradarota', array(
                'rota_id' => $rotaId,
                'pedido_id' => $pId,
                'sequencia' => $seq,
                'status' => 'PENDENTE',
            ));
            $adicionados++;
        }
        $patch = array();
        if ($motoristaId && (int) $pedido['motorista_id'] !== (int) $motoristaId) {
            $patch['motorista_id'] = $motoristaId;
        }
        if ($rota['veiculo_id'] && (int) $pedido['veiculo_id'] !== (int) $rota['veiculo_id']) {
            $patch['veiculo_id'] = $rota['veiculo_id'];
        }
        if ($pedido['status'] === 'Pendente') {
            $patch['status'] = 'Em Rota';
        }
        if ($patch) {
            tms_update('pedidos_pedido', $pId, $patch);
        }
    }
    $total = tms_one('SELECT COUNT(*) AS c FROM roteirizacao_paradarota WHERE rota_id = ?', array($rotaId));
    tms_json_out(array(
        'message' => $adicionados . ' pedido(s) adicionado(s) com sucesso à rota ' . $rota['codigo'] . '.',
        'total_paradas' => (int) $total['c'],
    ));
}

function tms_handle_mover_pedido($id)
{
    $pedido = tms_get('pedidos_pedido', $id);
    if (!$pedido) {
        tms_fail('Pedido não encontrado', 404);
    }
    $body = tms_body();
    $patch = array();
    if (isset($body['status'])) {
        $patch['status'] = $body['status'];
    }
    if (array_key_exists('veiculo_id', $body)) {
        $patch['veiculo_id'] = $body['veiculo_id'] === '' ? null : $body['veiculo_id'];
    }
    if ($patch) {
        tms_update('pedidos_pedido', $id, $patch);
        $pedido = tms_get('pedidos_pedido', $id);
    }
    $hoje = date('Y-m-d');
    if (!empty($pedido['veiculo_id'])) {
        $veiculo = tms_get('cadastros_veiculo', $pedido['veiculo_id']);
        $rota = tms_one(
            "SELECT * FROM roteirizacao_rota WHERE veiculo_id = ? AND data_rota = ? AND status NOT IN ('CANCELADA','CONCLUIDA') ORDER BY id DESC LIMIT 1",
            array($pedido['veiculo_id'], $hoje)
        );
        if (!$rota) {
            $rid = tms_insert('roteirizacao_rota', array(
                'codigo' => 'ROTA-' . $veiculo['placa'] . '-' . date('dmY'),
                'data_rota' => $hoje,
                'veiculo_id' => $pedido['veiculo_id'],
                'status' => 'PLANEJADA',
                'criado_em' => tms_now(),
                'atualizado_em' => tms_now(),
            ));
            $rota = tms_get('roteirizacao_rota', $rid);
        }
    } else {
        $rota = tms_one(
            "SELECT * FROM roteirizacao_rota WHERE data_rota = ? AND veiculo_id IS NULL AND status NOT IN ('CANCELADA','CONCLUIDA') ORDER BY id DESC LIMIT 1",
            array($hoje)
        );
        if (!$rota) {
            $rid = tms_insert('roteirizacao_rota', array(
                'codigo' => 'BACKLOG-' . date('dmY'),
                'data_rota' => $hoje,
                'status' => 'PLANEJADA',
                'criado_em' => tms_now(),
                'atualizado_em' => tms_now(),
            ));
            $rota = tms_get('roteirizacao_rota', $rid);
        }
    }
    tms_exec('DELETE FROM roteirizacao_paradarota WHERE pedido_id = ? AND rota_id <> ?', array($id, (int) $rota['id']));
    $parada = tms_one('SELECT * FROM roteirizacao_paradarota WHERE pedido_id = ? AND rota_id = ? LIMIT 1', array($id, (int) $rota['id']));
    if (!$parada) {
        $seq = tms_one('SELECT COALESCE(MAX(sequencia),0) AS s FROM roteirizacao_paradarota WHERE rota_id = ?', array((int) $rota['id']));
        tms_insert('roteirizacao_paradarota', array(
            'rota_id' => $rota['id'],
            'pedido_id' => $id,
            'sequencia' => ((int) $seq['s']) + 1,
            'status' => 'PENDENTE',
        ));
    }
    tms_json_out(tms_serialize_pedido(tms_get('pedidos_pedido', $id)));
}

function tms_handle_motorista_entregas($user)
{
    if (tms_is_motorista_portal($user)) {
        $rotas = tms_all(
            "SELECT DISTINCT r.* FROM roteirizacao_rota r
             LEFT JOIN cadastros_equipe e ON e.id = r.equipe_id
             LEFT JOIN cadastros_veiculo v ON v.id = r.veiculo_id
             LEFT JOIN cadastros_equipe ve ON ve.id = v.equipe_id
             LEFT JOIN roteirizacao_paradarota p ON p.rota_id = r.id
             LEFT JOIN pedidos_pedido ped ON ped.id = p.pedido_id
             WHERE r.status <> 'CANCELADA' AND (
                r.motorista_id = ? OR r.ajudante_id = ? OR e.motorista_id = ? OR ve.motorista_id = ? OR ped.motorista_id = ?
             ) ORDER BY r.data_rota, r.id",
            array($user['id'], $user['id'], $user['id'], $user['id'], $user['id'])
        );
    } else {
        $rotas = tms_all("SELECT * FROM roteirizacao_rota WHERE status <> 'CANCELADA' AND veiculo_id IS NOT NULL ORDER BY data_rota, id");
    }
    $ids = array(0);
    foreach ($rotas as $r) {
        $ids[] = (int) $r['id'];
    }
    $in = implode(',', $ids);
    $paradas = tms_all("SELECT * FROM roteirizacao_paradarota WHERE rota_id IN ($in) ORDER BY rota_id, sequencia");
    $out = array();
    foreach ($paradas as $p) {
        $out[] = tms_serialize_parada($p, true);
    }
    tms_json_out($out);
}

function tms_handle_nps_resumo()
{
    $total = (int) tms_one('SELECT COUNT(*) AS c FROM satisfacao_avaliacaonps')['c'];
    if ($total === 0) {
        tms_json_out(array('nps' => 0, 'promotores' => 0, 'neutros' => 0, 'detratores' => 0, 'total' => 0));
    }
    $promotores = (int) tms_one('SELECT COUNT(*) AS c FROM satisfacao_avaliacaonps WHERE nota >= 9')['c'];
    $neutros = (int) tms_one('SELECT COUNT(*) AS c FROM satisfacao_avaliacaonps WHERE nota BETWEEN 7 AND 8')['c'];
    $detratores = (int) tms_one('SELECT COUNT(*) AS c FROM satisfacao_avaliacaonps WHERE nota <= 6')['c'];
    tms_json_out(array(
        'nps' => round((($promotores - $detratores) / $total) * 100, 1),
        'promotores' => $promotores,
        'neutros' => $neutros,
        'detratores' => $detratores,
        'total' => $total,
    ));
}

function tms_handle_metrics()
{
    $qs = 'SELECT * FROM pedidos_pedido WHERE 1=1';
    $params = array();
    if (!empty($_GET['dt_inicio'])) {
        $qs .= ' AND DATE(criado_em) >= ?';
        $params[] = $_GET['dt_inicio'];
    }
    if (!empty($_GET['dt_fim'])) {
        $qs .= ' AND DATE(criado_em) <= ?';
        $params[] = $_GET['dt_fim'];
    }
    $pedidos = tms_all($qs, $params);
    $total = count($pedidos);
    $entregues = 0;
    $transito = 0;
    $veiculos = array();
    foreach ($pedidos as $p) {
        if ($p['status'] === 'Entregue') {
            $entregues++;
        }
        if ($p['status'] === 'Em Rota') {
            $transito++;
        }
        if (!empty($p['veiculo_id'])) {
            $veiculos[$p['veiculo_id']] = true;
        }
    }
    $totalVeiculos = (int) tms_one('SELECT COUNT(*) AS c FROM cadastros_veiculo')['c'];
    $npsRow = tms_one('SELECT AVG(nota) AS media FROM satisfacao_avaliacaonps');
    tms_json_out(array(
        'otif' => $total ? round($entregues / $total * 100, 1) : 0,
        'em_transito' => $transito,
        'custo_km' => round(4.5 + (mt_rand(0, 200) / 100), 2),
        'ocupacao_frota' => $totalVeiculos ? round(count($veiculos) / $totalVeiculos * 100, 1) : 0,
        'total_pedidos' => $total,
        'satisfacao_nps' => $npsRow && $npsRow['media'] !== null ? round((float) $npsRow['media'], 1) : '—',
        'emissao_co2' => '—',
    ));
}

function tms_handle_importa_nota()
{
    $arquivo = null;
    foreach (array('arquivo', 'file', 'pdf', 'documento') as $campo) {
        if (!empty($_FILES[$campo]['tmp_name'])) {
            $arquivo = $_FILES[$campo];
            break;
        }
    }
    if (!$arquivo) {
        tms_fail('Nenhum arquivo encontrado.', 400);
    }
    $bin = file_get_contents($arquivo['tmp_name']);
    $texto = tms_pdf_text($bin);
    $textoCompacto = trim(preg_replace('/\s+/', ' ', $texto));
    $linhas = array();
    foreach (preg_split('/\r\n|\n|\r/', $texto) as $linha) {
        $linha = trim($linha);
        if ($linha !== '') {
            $linhas[] = $linha;
        }
    }
    $numero = tms_extract_numero_pedido($textoCompacto, $linhas);
    if ($numero === '') {
        tms_fail('Não foi possível identificar o número da nota no PDF.', 422);
    }
    $itens = tms_extract_breton_items($textoCompacto);
    if (!$itens) {
        tms_fail('Nenhum item de produto foi identificado no PDF.', 422);
    }
    $existente = tms_one('SELECT id FROM pedidos_pedido WHERE numero_nota = ? LIMIT 1', array($numero));
    $cliente = tms_extract_field($textoCompacto, 'Cliente', array('Pedido Web'));
    $endereco = tms_extract_field($textoCompacto, 'Endereço', array('Bairro'));
    $bairro = tms_extract_field($textoCompacto, 'Bairro', array('Municipio', 'Município'));
    $cep = tms_extract_field($textoCompacto, 'CEP', array('Data da Entrega'));
    tms_json_out(array(
        'message' => 'PDF processado com sucesso.',
        'pedido_numero' => $numero,
        'dados_nf' => array(
            'id' => $existente ? (int) $existente['id'] : null,
            'numero_nota' => $numero,
            'pedido_numero' => $numero,
            'pedido_web' => tms_extract_field($textoCompacto, 'Pedido Web', array('Endereço')),
            'loja' => tms_extract_field($textoCompacto, 'Loja', array('Tipo de Pedido')),
            'cliente' => $cliente,
            'data_entrega' => tms_extract_field($textoCompacto, 'Data da Entrega', array('Periodo Entrega', 'Período Entrega')),
            'periodo' => tms_extract_field($textoCompacto, 'Periodo Entrega', array('Placa do Veiculo', 'Placa do Veículo')),
            'placa_veiculo' => tms_extract_field($textoCompacto, 'Placa do Veiculo', array('Obs')),
            'observacao' => '',
            'cnpj_cpf' => '',
            'endereco' => $endereco,
            'bairro' => $bairro,
            'cidade' => '',
            'uf' => '',
            'cep' => $cep,
            'destinatario' => array(
                'nome' => $cliente,
                'cnpj_cpf' => '',
                'logradouro' => $endereco,
                'bairro' => $bairro,
                'cidade' => 'BRASILIA',
                'uf' => 'DF',
                'cep' => $cep,
            ),
            'emitente' => array('nome' => tms_extract_field($textoCompacto, 'Loja', array('Tipo de Pedido'))),
            'itens' => $itens,
        ),
    ));
}

function tms_pdf_text($binary)
{
    $text = '';
    if (preg_match_all('/stream\s*(.*?)\s*endstream/s', $binary, $m)) {
        foreach ($m[1] as $stream) {
            $decoded = @gzuncompress($stream);
            if ($decoded === false) {
                $decoded = @gzinflate(substr($stream, 2));
            }
            if ($decoded === false) {
                $decoded = $stream;
            }
            if (preg_match_all('/\\((.*?)\\)/s', $decoded, $tm)) {
                $text .= implode(' ', $tm[1]) . "\n";
            }
            if (preg_match_all('/\\[(.*?)\\]/s', $decoded, $tm)) {
                $text .= ' ' . implode(' ', $tm[1]);
            }
        }
    }
    $text = str_replace(array('\\n', '\\r', '\\t'), array("\n", "\n", ' '), $text);
    return $text;
}

function tms_extract_field($text, $label, $nextLabels)
{
    $stops = array();
    foreach ($nextLabels as $item) {
        $stops[] = preg_quote($item, '/');
    }
    $pattern = '/' . preg_quote($label, '/') . '\s*:\s*(.*?)(?=\s+(?:' . implode('|', $stops) . ')(?:\s*:|\s|$)|$)/iu';
    if (preg_match($pattern, $text, $m)) {
        return trim($m[1], " -:;|");
    }
    return '';
}

function tms_extract_numero_pedido($text, $linhas)
{
    if (preg_match('/\bPEDIDO\s*:\s*([0-9]{4,6})\b/i', $text, $m)) {
        return $m[1];
    }
    foreach ($linhas as $idx => $linha) {
        $up = strtoupper($linha);
        if ((strpos($up, 'PEDIDO') !== false || strpos($up, 'NOTA') !== false) && strpos($up, 'WEB') === false) {
            if (preg_match('/(?:PEDIDO|NOTA|Nº)\s*:?\s*([0-9]{4,6})\b/i', $linha, $m)) {
                return $m[1];
            }
        }
    }
    return '';
}

function tms_extract_breton_items($text)
{
    $itens = array();
    if (preg_match_all('/(\d{15,16})\s+(\d{1,3}\/\d{1,3})\s+(\d+(?:[.,]\d{1,2})?)\s+(.+?)\s+(\d+(?:[.,]\d+)?X\d+(?:[.,]\d+)?X\d+(?:[.,]\d+)?)/iu', $text, $m, PREG_SET_ORDER)) {
        foreach ($m as $row) {
            $itens[] = array(
                'etiqueta' => $row[1],
                'codigo' => $row[1],
                'descricao' => trim($row[4]),
                'quantidade' => (float) str_replace(',', '.', $row[3]),
                'unidade' => 'UN',
            );
        }
    }
    return $itens;
}
