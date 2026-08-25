<?php

function tms_serialize_veiculo($row)
{
    $row = tms_cast_row($row, 'cadastros_veiculo');
    $motorista = tms_user_by_id(isset($row['motorista_id']) ? $row['motorista_id'] : null);
    $row['motorista'] = $motorista ? (int) $motorista['id'] : null;
    $row['motorista_nome'] = tms_user_name($motorista);
    $row['equipe'] = isset($row['equipe_id']) ? $row['equipe_id'] : null;
    return $row;
}

function tms_serialize_equipe($row)
{
    $row = tms_cast_row($row, 'cadastros_equipe');
    $motorista = tms_user_by_id(isset($row['motorista_id']) ? $row['motorista_id'] : null);
    $row['motorista'] = $motorista ? (int) $motorista['id'] : null;
    $row['motorista_nome'] = $motorista ? tms_user_name($motorista) : null;
    return $row;
}

function tms_serialize_funcionario($row)
{
    $row = tms_cast_row($row, 'cadastros_funcionario');
    $usuario = tms_user_by_id(isset($row['usuario_id']) ? $row['usuario_id'] : null);
    $partes = preg_split('/\s+/', trim(isset($row['nome']) ? $row['nome'] : ''), -1, PREG_SPLIT_NO_EMPTY);
    $row['first_name'] = $partes ? $partes[0] : '';
    $row['last_name'] = $partes && count($partes) > 1 ? implode(' ', array_slice($partes, 1)) : '';
    $row['usuario'] = $usuario ? (int) $usuario['id'] : null;
    $row['usuario_id'] = $usuario ? (int) $usuario['id'] : null;
    $row['email_acesso'] = $usuario && $usuario['email'] ? $usuario['email'] : (isset($row['email']) ? $row['email'] : '');
    $row['role'] = $usuario ? $usuario['role'] : 'Operacional';
    $row['username'] = $usuario ? $usuario['username'] : (isset($row['email']) && $row['email'] ? $row['email'] : (isset($row['cpf']) ? $row['cpf'] : ''));
    return $row;
}

function tms_serialize_pessoa($row)
{
    $row = tms_cast_row($row, 'cadastros_pessoaempresa');
    $row['tipo_label'] = (isset($row['tipo']) && $row['tipo'] === 'FISICA') ? 'Pessoa Física' : 'Pessoa Jurídica';
    $labels = array(
        'REMETENTE' => 'Remetente',
        'DESTINATARIO' => 'Destinatário',
        'EXPEDIDOR' => 'Expedidor',
        'LOCAL' => 'Local de entrega',
    );
    $papeis = array();
    foreach (explode(',', isset($row['papeis']) ? $row['papeis'] : '') as $p) {
        $p = strtoupper(trim($p));
        if ($p !== '') {
            $papeis[] = isset($labels[$p]) ? $labels[$p] : $p;
        }
    }
    $row['papeis_label'] = implode(', ', $papeis);
    $row['origem_label'] = (isset($row['origem']) && $row['origem'] === 'EMISSAO') ? 'Emissão' : 'Manual';
    return $row;
}

function tms_serialize_usuario($row)
{
    $row = tms_cast_row($row, 'core_usuario');
    return array(
        'id' => (int) $row['id'],
        'username' => $row['username'],
        'first_name' => $row['first_name'],
        'last_name' => $row['last_name'],
        'email' => $row['email'],
        'role' => $row['role'],
        'telefone' => $row['telefone'],
        'is_active' => tms_bool($row['is_active']),
    );
}

function tms_serialize_produto($row)
{
    $row = tms_cast_row($row, 'estoque_produtoestoque');
    $row['codigo'] = $row['codigo_sku'];
    $row['descricao'] = $row['nome'];
    return $row;
}

function tms_serialize_movimentacao($row)
{
    $row = tms_cast_row($row, 'estoque_movimentacaoestoque');
    $row['produto'] = isset($row['produto_id']) ? (int) $row['produto_id'] : null;
    return $row;
}

function tms_pedido_itens($pedidoId)
{
    $itens = tms_all('SELECT * FROM pedidos_itempedido WHERE pedido_id = ? ORDER BY id', array((int) $pedidoId));
    $out = array();
    foreach ($itens as $item) {
        $item = tms_cast_row($item, 'pedidos_itempedido');
        $item['produto'] = isset($item['produto_id']) ? (string) $item['produto_id'] : null;
        $out[] = $item;
    }
    return $out;
}

function tms_historico_entrega($pedido)
{
    $parada = tms_one(
        'SELECT * FROM roteirizacao_paradarota WHERE pedido_id = ? ORDER BY id DESC LIMIT 1',
        array((int) $pedido['id'])
    );
    if (!$parada) {
        return array();
    }
    $evidencias = array();
    if (!empty($pedido['foto_entrega_base64'])) {
        $parsed = json_decode($pedido['foto_entrega_base64'], true);
        if (is_array($parsed)) {
            $idx = 1;
            foreach ($parsed as $i) {
                if (is_array($i)) {
                    $evidencias[] = array(
                        'nome' => isset($i['nome']) ? $i['nome'] : ('foto-' . $idx),
                        'mime' => isset($i['mime']) ? $i['mime'] : 'image/jpeg',
                        'origem' => isset($i['origem']) ? $i['origem'] : '',
                        'url' => isset($i['data_base64']) ? $i['data_base64'] : (isset($i['url']) ? $i['url'] : ''),
                    );
                } elseif (is_string($i)) {
                    $evidencias[] = array('nome' => 'foto-' . $idx, 'mime' => 'image/jpeg', 'origem' => '', 'url' => $i);
                }
                $idx++;
            }
        } elseif (strpos((string) $pedido['foto_entrega_base64'], 'data:image/') === 0) {
            $evidencias[] = array('nome' => 'foto-1', 'mime' => 'image/jpeg', 'origem' => '', 'url' => $pedido['foto_entrega_base64']);
        }
    }
    $chegada = array();
    $ressalva = array();
    $finalizacao = array();
    foreach ($evidencias as $x) {
        $origem = isset($x['origem']) ? trim($x['origem']) : '';
        if ($origem === 'foto_chegada' || $origem === 'fotos_chegada') {
            $chegada[] = $x;
        } elseif ($origem === 'fotos_ressalva') {
            $ressalva[] = $x;
        } else {
            $finalizacao[] = $x;
        }
    }
    $eventos = array();
    $timeline = array(
        array('saida_entrega', 'Saída para Entrega', 'SAIDA'),
        array('chegada_cliente', 'Chegada no Cliente', 'CHEGADA'),
        array('inicio_descarregamento', 'Início de Descarregamento', 'INICIO'),
        array('finalizado', 'Finalização', $parada['status']),
    );
    foreach ($timeline as $item) {
        $valor = isset($parada[$item[0]]) ? $parada[$item[0]] : null;
        if ($valor) {
            $ev = array();
            if ($item[2] === 'CHEGADA') {
                $ev = $chegada;
            } elseif ($item[1] === 'Finalização') {
                $ev = $finalizacao;
            }
            $eventos[] = array(
                'titulo' => $item[1],
                'status' => $item[2],
                'timestamp' => tms_fmt_dt($valor),
                'evidencias' => $ev,
                'evidencias_total' => count($ev),
            );
        }
    }
    if ($parada['status'] === 'RESSALVA' && $ressalva) {
        $eventos[] = array(
            'titulo' => 'Fotos dos Produtos com Ressalva',
            'status' => 'RESSALVA',
            'timestamp' => tms_fmt_dt($parada['finalizado']),
            'evidencias' => $ressalva,
            'evidencias_total' => count($ressalva),
        );
    }
    $eventos[] = array(
        'titulo' => 'Status Atual',
        'status' => $parada['status'],
        'recebedor' => $parada['recebedor'] ? $parada['recebedor'] : '',
        'documento_recebedor' => $parada['documento_recebedor'] ? $parada['documento_recebedor'] : '',
        'observacoes_entrega' => $parada['observacoes_entrega'] ? $parada['observacoes_entrega'] : '',
        'evidencias' => array(),
        'evidencias_total' => count($evidencias),
    );
    return $eventos;
}

function tms_serialize_pedido($row)
{
    $row = tms_cast_row($row, 'pedidos_pedido');
    $row['veiculo'] = isset($row['veiculo_id']) ? $row['veiculo_id'] : null;
    $row['motorista'] = isset($row['motorista_id']) ? $row['motorista_id'] : null;
    $row['itens'] = tms_pedido_itens($row['id']);
    $row['destinatario'] = array(
        'nome' => $row['cliente'],
        'cnpj_cpf' => $row['cnpj_cpf'] ? $row['cnpj_cpf'] : '',
        'logradouro' => $row['endereco'],
        'bairro' => $row['bairro'] ? $row['bairro'] : '',
        'cidade' => $row['cidade'] ? $row['cidade'] : '',
        'uf' => $row['uf'] ? $row['uf'] : '',
        'cep' => $row['cep'] ? $row['cep'] : '',
    );
    $row['emitente'] = array('nome' => $row['loja'] ? $row['loja'] : '');
    $row['historico_entrega'] = tms_historico_entrega($row);
    return $row;
}

function tms_serialize_parada($row, $withPedido = true)
{
    $row = tms_cast_row($row, 'roteirizacao_paradarota');
    $row['rota'] = isset($row['rota_id']) ? (int) $row['rota_id'] : null;
    $row['pedido_id'] = isset($row['pedido_id']) ? (int) $row['pedido_id'] : null;
    if ($withPedido && $row['pedido_id']) {
        $pedido = tms_get('pedidos_pedido', $row['pedido_id']);
        $row['pedido'] = $pedido ? tms_serialize_pedido($pedido) : null;
    }
    return $row;
}

function tms_serialize_rota($row)
{
    $row = tms_cast_row($row, 'roteirizacao_rota');
    $veiculo = !empty($row['veiculo_id']) ? tms_get('cadastros_veiculo', $row['veiculo_id']) : null;
    $equipe = !empty($row['equipe_id']) ? tms_get('cadastros_equipe', $row['equipe_id']) : null;
    $motorista = tms_user_by_id(isset($row['motorista_id']) ? $row['motorista_id'] : null);
    $ajudante = tms_user_by_id(isset($row['ajudante_id']) ? $row['ajudante_id'] : null);
    $paradas = tms_all('SELECT * FROM roteirizacao_paradarota WHERE rota_id = ? ORDER BY sequencia', array((int) $row['id']));
    $serializedParadas = array();
    $peso = 0;
    $volume = 0;
    foreach ($paradas as $p) {
        $sp = tms_serialize_parada($p, true);
        $serializedParadas[] = $sp;
        if (!empty($sp['pedido']['peso_total'])) {
            $peso += (float) $sp['pedido']['peso_total'];
        }
        if (!empty($sp['pedido']['volume_total'])) {
            $volume += (float) $sp['pedido']['volume_total'];
        }
    }
    $row['veiculo'] = $veiculo ? (int) $veiculo['id'] : null;
    $row['veiculo_placa'] = $veiculo ? $veiculo['placa'] : null;
    $row['equipe'] = $equipe ? (int) $equipe['id'] : null;
    $row['equipe_nome'] = $equipe ? $equipe['nome'] : null;
    $row['motorista'] = $motorista ? (int) $motorista['id'] : null;
    $row['motorista_nome'] = $motorista ? tms_user_name($motorista) : ($equipe && !empty($equipe['motorista_id']) ? tms_user_name(tms_user_by_id($equipe['motorista_id'])) : '');
    $row['ajudante'] = $ajudante ? (int) $ajudante['id'] : null;
    $row['ajudante_nome'] = tms_user_name($ajudante);
    $row['paradas'] = $serializedParadas;
    $row['total_pedidos'] = count($serializedParadas);
    $row['total_peso'] = $peso;
    $row['total_volume'] = $volume;
    return $row;
}

function tms_serialize_nps($row)
{
    $row = tms_cast_row($row, 'satisfacao_avaliacaonps');
    $nota = (int) $row['nota'];
    if ($nota >= 9) {
        $row['classificacao'] = 'Promotor';
    } elseif ($nota >= 7) {
        $row['classificacao'] = 'Neutro';
    } else {
        $row['classificacao'] = 'Detrator';
    }
    $row['pedido'] = isset($row['pedido_id']) ? (int) $row['pedido_id'] : null;
    return $row;
}

function tms_digits($value)
{
    return substr(preg_replace('/\D+/', '', (string) $value), 0, 14);
}

function tms_upsert_pessoa($dados)
{
    $nome = trim(isset($dados['nome']) ? $dados['nome'] : '');
    if ($nome === '') {
        return null;
    }
    $documento = trim(isset($dados['documento']) ? $dados['documento'] : '');
    $digits = tms_digits($documento);
    $papel = strtoupper(trim(isset($dados['papel']) ? $dados['papel'] : 'DESTINATARIO'));
    $increment = !empty($dados['increment']);
    if ($digits !== '') {
        $obj = tms_one('SELECT * FROM cadastros_pessoaempresa WHERE documento_digits = ? LIMIT 1', array($digits));
    } else {
        $obj = tms_one('SELECT * FROM cadastros_pessoaempresa WHERE nome = ? AND documento_digits = "" LIMIT 1', array($nome));
    }
    $tipo = strlen($digits) === 11 ? 'FISICA' : 'JURIDICA';
    $agora = tms_now();
    if ($obj) {
        $papeis = $obj['papeis'];
        if ($papel && strpos(',' . $papeis . ',', ',' . $papel . ',') === false) {
            $papeis = trim($papeis . ',' . $papel, ',');
        }
        $patch = array('papeis' => $papeis);
        if (!$obj['documento'] && $documento) {
            $patch['documento'] = $documento;
            $patch['documento_digits'] = $digits;
            $patch['tipo'] = $tipo;
        }
        foreach (array('endereco', 'complemento', 'numero', 'cidade', 'uf', 'cep') as $campo) {
            if (empty($obj[$campo]) && !empty($dados[$campo])) {
                $patch[$campo] = $campo === 'uf' ? strtoupper($dados[$campo]) : $dados[$campo];
            }
        }
        if ($increment) {
            $patch['qtd_emissoes'] = ((int) $obj['qtd_emissoes']) + 1;
            $patch['ultima_emissao'] = $agora;
            $patch['origem'] = 'EMISSAO';
        }
        $patch['atualizado_em'] = $agora;
        tms_update('cadastros_pessoaempresa', $obj['id'], $patch);
        return (int) $obj['id'];
    }
    return tms_insert('cadastros_pessoaempresa', array(
        'nome' => $nome,
        'documento' => $documento,
        'documento_digits' => $digits,
        'tipo' => $tipo,
        'papeis' => $papel,
        'endereco' => isset($dados['endereco']) ? $dados['endereco'] : '',
        'complemento' => isset($dados['complemento']) ? $dados['complemento'] : '',
        'numero' => isset($dados['numero']) ? $dados['numero'] : '',
        'cidade' => isset($dados['cidade']) ? $dados['cidade'] : '',
        'uf' => strtoupper(isset($dados['uf']) ? $dados['uf'] : ''),
        'cep' => isset($dados['cep']) ? $dados['cep'] : '',
        'origem' => isset($dados['origem']) ? $dados['origem'] : 'EMISSAO',
        'qtd_emissoes' => $increment ? 1 : 0,
        'ultima_emissao' => $increment ? $agora : null,
        'ativo' => 1,
        'criado_em' => $agora,
        'atualizado_em' => $agora,
    ));
}

function tms_registrar_pessoas_pedido($pedido, $body)
{
    tms_upsert_pessoa(array(
        'nome' => isset($body['remetente_nome']) ? $body['remetente_nome'] : $pedido['loja'],
        'documento' => isset($body['remetente_documento']) ? $body['remetente_documento'] : '',
        'endereco' => isset($body['remetente_endereco']) ? $body['remetente_endereco'] : '',
        'complemento' => isset($body['remetente_complemento']) ? $body['remetente_complemento'] : '',
        'numero' => isset($body['remetente_numero']) ? $body['remetente_numero'] : '',
        'cidade' => isset($body['remetente_cidade']) ? $body['remetente_cidade'] : '',
        'uf' => isset($body['remetente_uf']) ? $body['remetente_uf'] : '',
        'papel' => 'REMETENTE',
        'increment' => true,
    ));
    tms_upsert_pessoa(array(
        'nome' => isset($body['destinatario_nome']) ? $body['destinatario_nome'] : $pedido['cliente'],
        'documento' => isset($body['destinatario_documento']) ? $body['destinatario_documento'] : $pedido['cnpj_cpf'],
        'endereco' => isset($body['destinatario_endereco']) ? $body['destinatario_endereco'] : $pedido['endereco'],
        'complemento' => isset($body['destinatario_complemento']) ? $body['destinatario_complemento'] : $pedido['bairro'],
        'cidade' => isset($body['destinatario_cidade']) ? $body['destinatario_cidade'] : $pedido['cidade'],
        'uf' => isset($body['destinatario_uf']) ? $body['destinatario_uf'] : $pedido['uf'],
        'cep' => isset($body['destinatario_cep']) ? $body['destinatario_cep'] : $pedido['cep'],
        'papel' => 'DESTINATARIO',
        'increment' => true,
    ));
    tms_upsert_pessoa(array(
        'nome' => isset($body['expedidor_nome']) ? $body['expedidor_nome'] : '',
        'documento' => isset($body['expedidor_documento']) ? $body['expedidor_documento'] : '',
        'cidade' => isset($body['expedidor_cidade']) ? $body['expedidor_cidade'] : '',
        'uf' => isset($body['expedidor_uf']) ? $body['expedidor_uf'] : '',
        'papel' => 'EXPEDIDOR',
        'increment' => true,
    ));
    tms_upsert_pessoa(array(
        'nome' => isset($body['local_nome']) ? $body['local_nome'] : '',
        'documento' => isset($body['local_documento']) ? $body['local_documento'] : '',
        'cidade' => isset($body['local_cidade']) ? $body['local_cidade'] : '',
        'uf' => isset($body['local_uf']) ? $body['local_uf'] : '',
        'papel' => 'LOCAL',
        'increment' => true,
    ));
}

function tms_resolve_produto($item)
{
    $codigo = '';
    if (!empty($item['produto']) && !is_array($item['produto'])) {
        $codigo = (string) $item['produto'];
    }
    if ($codigo === '' && !empty($item['codigo'])) {
        $codigo = (string) $item['codigo'];
    }
    if ($codigo === '' && !empty($item['etiqueta'])) {
        $codigo = (string) $item['etiqueta'];
    }
    $codigo = trim($codigo);
    if ($codigo === '') {
        return null;
    }
    $produto = tms_one('SELECT * FROM estoque_produtoestoque WHERE codigo_sku = ? LIMIT 1', array($codigo));
    if (!$produto && ctype_digit($codigo)) {
        $produto = tms_get('estoque_produtoestoque', $codigo);
    }
    if ($produto) {
        return $produto;
    }
    $id = tms_insert('estoque_produtoestoque', array(
        'codigo_sku' => $codigo,
        'nome' => !empty($item['descricao']) ? $item['descricao'] : $codigo,
        'quantidade' => 0,
        'unidade' => !empty($item['unidade']) ? $item['unidade'] : 'UN',
        'etiqueta' => !empty($item['etiqueta']) ? $item['etiqueta'] : '',
    ));
    return tms_get('estoque_produtoestoque', $id);
}

function tms_replace_itens($pedido, $itens, $restore = false)
{
    if ($restore) {
        foreach (tms_all('SELECT * FROM pedidos_itempedido WHERE pedido_id = ?', array((int) $pedido['id'])) as $item) {
            if (!empty($item['produto_id'])) {
                $produto = tms_get('estoque_produtoestoque', $item['produto_id']);
                if ($produto) {
                    tms_update('estoque_produtoestoque', $produto['id'], array(
                        'quantidade' => ((float) $produto['quantidade']) + ((float) $item['quantidade']),
                    ));
                    tms_insert('estoque_movimentacaoestoque', array(
                        'produto_id' => $produto['id'],
                        'tipo' => 'entrada',
                        'quantidade' => $item['quantidade'],
                        'motivo' => 'Estorno da atualização do pedido ' . $pedido['numero_nota'],
                        'data_hora' => tms_now(),
                    ));
                }
            }
        }
    }
    tms_exec('DELETE FROM pedidos_itempedido WHERE pedido_id = ?', array((int) $pedido['id']));
    foreach ($itens as $item) {
        $qtd = isset($item['quantidade']) ? (float) $item['quantidade'] : 1;
        if ($qtd <= 0) {
            tms_fail(array('itens' => 'A quantidade dos itens deve ser maior que zero.'), 400);
        }
        $produto = tms_resolve_produto($item);
        if (!$produto) {
            continue;
        }
        tms_insert('pedidos_itempedido', array(
            'pedido_id' => $pedido['id'],
            'produto_id' => $produto['id'],
            'codigo' => isset($item['codigo']) ? $item['codigo'] : $produto['codigo_sku'],
            'etiqueta' => isset($item['etiqueta']) ? $item['etiqueta'] : '',
            'descricao' => isset($item['descricao']) ? $item['descricao'] : $produto['nome'],
            'quantidade' => $qtd,
            'unidade' => isset($item['unidade']) ? $item['unidade'] : 'UN',
            'peso_unitario' => isset($item['peso_unitario']) ? $item['peso_unitario'] : 0,
            'valor_unitario' => isset($item['valor_unitario']) ? $item['valor_unitario'] : 0,
        ));
        tms_update('estoque_produtoestoque', $produto['id'], array(
            'quantidade' => ((float) $produto['quantidade']) - $qtd,
        ));
        tms_insert('estoque_movimentacaoestoque', array(
            'produto_id' => $produto['id'],
            'tipo' => 'saida',
            'quantidade' => $qtd,
            'motivo' => 'Saída automática para o pedido ' . $pedido['numero_nota'],
            'data_hora' => tms_now(),
        ));
    }
}

function tms_pedido_payload($body)
{
    $map = array(
        'numero_nota', 'pedido_web', 'loja', 'cliente', 'cnpj_cpf', 'endereco', 'bairro', 'cidade', 'uf', 'cep',
        'data_entrega', 'periodo', 'placa_veiculo', 'observacao', 'peso_total', 'volume_total', 'tipo_operacao',
        'status', 'assinatura_base64', 'foto_entrega_base64',
    );
    $out = array();
    foreach ($map as $campo) {
        if (array_key_exists($campo, $body)) {
            $out[$campo] = $body[$campo];
        }
    }
    if (isset($body['veiculo'])) {
        $out['veiculo_id'] = $body['veiculo'] === '' ? null : $body['veiculo'];
    }
    if (isset($body['motorista'])) {
        $out['motorista_id'] = $body['motorista'] === '' ? null : $body['motorista'];
    }
    if (isset($out['uf']) && $out['uf']) {
        $out['uf'] = strtoupper(substr($out['uf'], 0, 2));
    }
    return $out;
}

function tms_garantir_backlog($pedido)
{
    $hoje = date('Y-m-d');
    $rota = tms_one(
        "SELECT * FROM roteirizacao_rota WHERE data_rota = ? AND veiculo_id IS NULL AND status NOT IN ('CANCELADA','CONCLUIDA') ORDER BY id DESC LIMIT 1",
        array($hoje)
    );
    if (!$rota) {
        $id = tms_insert('roteirizacao_rota', array(
            'codigo' => 'BACKLOG-' . date('dmY'),
            'data_rota' => $hoje,
            'status' => 'PLANEJADA',
            'criado_em' => tms_now(),
            'atualizado_em' => tms_now(),
        ));
        $rota = tms_get('roteirizacao_rota', $id);
    }
    $existe = tms_one('SELECT id FROM roteirizacao_paradarota WHERE pedido_id = ? LIMIT 1', array((int) $pedido['id']));
    if ($existe) {
        return;
    }
    $seq = tms_one('SELECT COALESCE(MAX(sequencia),0) AS s FROM roteirizacao_paradarota WHERE rota_id = ?', array((int) $rota['id']));
    tms_insert('roteirizacao_paradarota', array(
        'rota_id' => $rota['id'],
        'pedido_id' => $pedido['id'],
        'sequencia' => ((int) $seq['s']) + 1,
        'status' => 'PENDENTE',
    ));
}

function tms_get_or_create_equipe($usuarioId)
{
    if (!$usuarioId) {
        return null;
    }
    $equipe = tms_one('SELECT * FROM cadastros_equipe WHERE motorista_id = ? LIMIT 1', array((int) $usuarioId));
    if ($equipe) {
        return $equipe;
    }
    $user = tms_user_by_id($usuarioId);
    $base = 'Equipe ' . (tms_user_name($user) ?: ($user ? $user['username'] : $usuarioId));
    $nome = substr(trim($base), 0, 90);
    $indice = 1;
    while (tms_one('SELECT id FROM cadastros_equipe WHERE nome = ? LIMIT 1', array($nome))) {
        $indice++;
        $nome = substr($base . ' ' . $indice, 0, 100);
    }
    $id = tms_insert('cadastros_equipe', array(
        'nome' => $nome,
        'motorista_id' => $usuarioId,
        'membros_info' => '',
        'ativo' => 1,
    ));
    return tms_get('cadastros_equipe', $id);
}

function tms_map_status_pedido($statusParada)
{
    $mapa = array(
        'PENDENTE' => 'Pendente',
        'SAIDA' => 'Saida',
        'CHEGADA' => 'Chegada',
        'INICIO' => 'Inicio',
        'ENTREGA_REALIZADA' => 'Entregue',
        'RESSALVA' => 'Entregue',
    );
    $key = strtoupper((string) $statusParada);
    return isset($mapa[$key]) ? $mapa[$key] : null;
}

function tms_salvar_evidencias($parada)
{
    if (empty($parada['pedido_id']) || empty($_FILES)) {
        return;
    }
    $campos = array('fotos_entrega', 'foto_produtos', 'foto_chegada', 'fotos_chegada', 'foto_nota_assinada', 'fotos_ressalva');
    $novas = array();
    foreach ($campos as $campo) {
        if (empty($_FILES[$campo])) {
            continue;
        }
        $files = $_FILES[$campo];
        $lista = array();
        if (is_array($files['name'])) {
            $n = count($files['name']);
            for ($i = 0; $i < $n; $i++) {
                $lista[] = array(
                    'name' => $files['name'][$i],
                    'type' => $files['type'][$i],
                    'tmp_name' => $files['tmp_name'][$i],
                    'error' => $files['error'][$i],
                );
            }
        } else {
            $lista[] = $files;
        }
        foreach ($lista as $arquivo) {
            if (empty($arquivo['tmp_name']) || !empty($arquivo['error'])) {
                continue;
            }
            $bin = file_get_contents($arquivo['tmp_name']);
            if ($bin === false || $bin === '') {
                continue;
            }
            $mime = $arquivo['type'] ? $arquivo['type'] : 'image/jpeg';
            $novas[] = array(
                'nome' => $arquivo['name'],
                'mime' => $mime,
                'origem' => $campo,
                'hash' => md5($bin),
                'data_base64' => 'data:' . $mime . ';base64,' . base64_encode($bin),
            );
        }
    }
    if (!$novas) {
        return;
    }
    $pedido = tms_get('pedidos_pedido', $parada['pedido_id']);
    $existentes = array();
    if (!empty($pedido['foto_entrega_base64'])) {
        $parsed = json_decode($pedido['foto_entrega_base64'], true);
        if (is_array($parsed)) {
            $existentes = $parsed;
        }
    }
    tms_update('pedidos_pedido', $pedido['id'], array(
        'foto_entrega_base64' => json_encode(array_merge($existentes, $novas), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ));
}

function tms_registrar_satisfacao($parada, $body)
{
    $gostouRaw = isset($body['cliente_gostou']) ? $body['cliente_gostou'] : null;
    $notaRaw = isset($body['nps_nota']) ? $body['nps_nota'] : null;
    if (($gostouRaw === null || $gostouRaw === '') && ($notaRaw === null || $notaRaw === '')) {
        return;
    }
    $gostou = null;
    if ($gostouRaw !== null && $gostouRaw !== '') {
        $gostou = in_array(strtolower((string) $gostouRaw), array('1', 'true', 'sim', 'yes', 'gostou'), true);
    }
    $nota = ($notaRaw !== null && $notaRaw !== '') ? (int) $notaRaw : ($gostou ? 10 : 4);
    $nota = max(0, min(10, $nota));
    $comentario = isset($body['nps_comentario']) ? $body['nps_comentario'] : (isset($body['comentario']) ? $body['comentario'] : '');
    $pedido = tms_get('pedidos_pedido', $parada['pedido_id']);
    $avaliacao = tms_one('SELECT * FROM satisfacao_avaliacaonps WHERE pedido_id = ? ORDER BY id DESC LIMIT 1', array((int) $pedido['id']));
    $payload = array(
        'pedido_id' => $pedido['id'],
        'cliente' => $pedido['cliente'],
        'nota' => $nota,
        'comentario' => $comentario,
        'cliente_gostou' => $gostou === null ? null : ($gostou ? 1 : 0),
    );
    if ($avaliacao) {
        tms_update('satisfacao_avaliacaonps', $avaliacao['id'], $payload);
        return;
    }
    $payload['criado_em'] = tms_now();
    tms_insert('satisfacao_avaliacaonps', $payload);
}

function tms_atualizar_parada_status($id, $body, $user)
{
    $parada = tms_get('roteirizacao_paradarota', $id);
    if (!$parada) {
        tms_fail('Parada não encontrada.', 404);
    }
    if (tms_is_motorista_portal($user)) {
        $rota = tms_get('roteirizacao_rota', $parada['rota_id']);
        $ok = $rota && (
            (int) $rota['motorista_id'] === (int) $user['id']
            || (int) $rota['ajudante_id'] === (int) $user['id']
        );
        if (!$ok && $rota && $rota['equipe_id']) {
            $equipe = tms_get('cadastros_equipe', $rota['equipe_id']);
            $ok = $equipe && (int) $equipe['motorista_id'] === (int) $user['id'];
        }
        if (!$ok) {
            tms_fail('Esta parada não está atribuída ao motorista logado.', 403);
        }
    }
    $novo = isset($body['status']) ? $body['status'] : (isset($body['novo_status']) ? $body['novo_status'] : null);
    if (!$novo) {
        tms_fail('Status não informado.', 400);
    }
    $validos = array('PENDENTE', 'SAIDA', 'CHEGADA', 'INICIO', 'ENTREGA_REALIZADA', 'RESSALVA');
    if (!in_array($novo, $validos, true)) {
        tms_fail('Status inválido.', 400);
    }
    $map = array(
        'SAIDA' => 'saida_entrega',
        'CHEGADA' => 'chegada_cliente',
        'INICIO' => 'inicio_descarregamento',
        'ENTREGA_REALIZADA' => 'finalizado',
        'RESSALVA' => 'finalizado',
    );
    $patch = array('status' => $novo);
    if (isset($map[$novo])) {
        $patch[$map[$novo]] = tms_now();
    }
    foreach (array('recebedor', 'documento_recebedor', 'observacoes_entrega') as $campo) {
        if (array_key_exists($campo, $body)) {
            $patch[$campo] = $body[$campo];
        }
    }
    if (!empty($body['itens_ressalva'])) {
        $obs = isset($patch['observacoes_entrega']) ? $patch['observacoes_entrega'] : $parada['observacoes_entrega'];
        $itensRaw = $body['itens_ressalva'];
        $parsed = is_string($itensRaw) ? json_decode($itensRaw, true) : $itensRaw;
        $itens = array();
        if (is_array($parsed)) {
            foreach ($parsed as $item) {
                if (is_array($item)) {
                    $texto = trim((isset($item['codigo']) ? $item['codigo'] : '') . ' - ' . (isset($item['descricao']) ? $item['descricao'] : ''), ' -');
                    if ($texto !== '') {
                        $itens[] = $texto;
                    }
                } elseif (is_string($item) && trim($item) !== '') {
                    $itens[] = trim($item);
                }
            }
        }
        if ($itens && strpos((string) $obs, 'Itens com ressalva:') === false) {
            $sufixo = 'Itens com ressalva: ' . implode('; ', $itens);
            $patch['observacoes_entrega'] = trim((string) $obs) !== '' ? ($obs . ' | ' . $sufixo) : $sufixo;
        }
    }
    $patch['foto_chegada'] = null;
    $patch['foto_produtos'] = null;
    $patch['foto_nota_assinada'] = null;
    tms_update('roteirizacao_paradarota', $id, $patch);
    $parada = tms_get('roteirizacao_paradarota', $id);
    $statusPedido = tms_map_status_pedido($novo);
    if ($statusPedido && $parada['pedido_id']) {
        tms_update('pedidos_pedido', $parada['pedido_id'], array('status' => $statusPedido));
    }
    tms_salvar_evidencias($parada);
    if ($novo === 'ENTREGA_REALIZADA' || $novo === 'RESSALVA') {
        tms_registrar_satisfacao($parada, $body);
    }
    $parada = tms_serialize_parada(tms_get('roteirizacao_paradarota', $id), true);
    tms_json_out(array(
        'message' => 'Status atualizado para ' . $novo . ' com sucesso!',
        'parada' => $parada,
    ));
}

function tms_handle_auth_login()
{
    $body = tms_body();
    $username = trim(isset($body['username']) ? $body['username'] : '');
    $password = isset($body['password']) ? $body['password'] : '';
    if ($username === '' || $password === '') {
        tms_fail(array('detail' => 'No active account found with the given credentials'), 401);
    }
    $user = tms_one(
        'SELECT * FROM core_usuario WHERE username = ? OR email = ? LIMIT 1',
        array($username, $username)
    );
    if (!$user || empty($user['is_active']) || !tms_password_verify($password, $user['password'])) {
        tms_fail(array('detail' => 'No active account found with the given credentials'), 401);
    }
    tms_update('core_usuario', $user['id'], array('last_login' => tms_now()));
    tms_json_out(tms_tokens_for($user));
}

function tms_handle_auth_refresh()
{
    $body = tms_body();
    $token = isset($body['refresh']) ? $body['refresh'] : '';
    $payload = tms_jwt_decode($token);
    if (!$payload || (isset($payload['token_type']) && $payload['token_type'] !== 'refresh')) {
        tms_fail('Token inválido.', 401);
    }
    $user = tms_user_by_id($payload['user_id']);
    if (!$user) {
        tms_fail('Token inválido.', 401);
    }
    tms_json_out(tms_tokens_for($user));
}

function tms_list_map($sql, $params, $serializer)
{
    $rows = tms_all($sql, $params);
    $out = array();
    foreach ($rows as $row) {
        $out[] = call_user_func($serializer, $row);
    }
    return $out;
}
