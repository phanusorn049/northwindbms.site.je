<?php

declare(strict_types=1);

final class Response
{
    public static function json(array $body, int $status = 200): never
    {
        http_response_code($status);
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
        exit;
    }
}
