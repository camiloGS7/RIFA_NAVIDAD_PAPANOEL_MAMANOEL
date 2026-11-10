-- ============================================================================
-- Esquema de base de datos - Gran Rifa Papa y Mama Noel
-- Motor: PostgreSQL (Neon DB)
--
-- Este script es idempotente: puede ejecutarse varias veces sin afectar las
-- ventas ya registradas. El servidor ejecuta la misma logica al arrancar
-- (lib/db.js), por lo que su uso manual es opcional.
-- ============================================================================

CREATE TABLE IF NOT EXISTS boletos_rifa (
    id               SERIAL PRIMARY KEY,
    numero           VARCHAR(2)   UNIQUE NOT NULL,       -- '01' a '99' y '00'
    nombre_comprador VARCHAR(150) DEFAULT NULL,
    telefono         VARCHAR(20)  DEFAULT NULL,          -- Solo digitos
    estado           BOOLEAN      NOT NULL DEFAULT FALSE, -- FALSE = disponible, TRUE = vendido
    pagado           BOOLEAN      NOT NULL DEFAULT FALSE, -- TRUE cuando el comprador ya pago
    fecha_venta      TIMESTAMPTZ  DEFAULT NULL
);

-- Migraciones para bases creadas con versiones anteriores.
ALTER TABLE boletos_rifa ADD COLUMN IF NOT EXISTS telefono VARCHAR(20) DEFAULT NULL;
ALTER TABLE boletos_rifa ADD COLUMN IF NOT EXISTS pagado BOOLEAN NOT NULL DEFAULT FALSE;

-- Poblar los 100 numeros: del '01' al '99' y finalmente el '00'.
INSERT INTO boletos_rifa (numero)
SELECT LPAD((n % 100)::TEXT, 2, '0')
FROM generate_series(1, 100) AS n
ON CONFLICT (numero) DO NOTHING;
