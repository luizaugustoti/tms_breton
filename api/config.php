<?php
/**
 * Configuração da API PHP do TMS (hospedagem Locaweb / Apache).
 * Usa o mesmo MySQL do Django.
 */
return array(
    'db_host' => getenv('DB_HOST') ?: 'system_breton.mysql.dbaas.com.br',
    'db_port' => getenv('DB_PORT') ?: '3306',
    'db_name' => getenv('DB_NAME') ?: 'system_breton',
    'db_user' => getenv('DB_USER') ?: 'system_breton',
    'db_password' => getenv('DB_PASSWORD') ?: 'Breton@123456',
    'jwt_secret' => getenv('DJANGO_SECRET_KEY') ?: 'django-insecure-tms-breton-secret-key-change-this-in-production',
    'access_ttl' => 86400,
    'refresh_ttl' => 604800,
);
