-- ============================================================
-- Carbon Monitor — Schema Migration
-- Database: carbon_db
-- Run in Snowflake UI (Worksheets) top to bottom
-- ============================================================

USE DATABASE carbon_db;
USE WAREHOUSE carbon_wh;

-- ── 1. Cities dimension table (PUBLIC schema) ─────────────────
USE SCHEMA PUBLIC;

CREATE TABLE IF NOT EXISTS cities (
    location      VARCHAR(120) NOT NULL,
    country       VARCHAR(100),
    country_code  CHAR(2),
    region        VARCHAR(60),
    lat           FLOAT,
    lon           FLOAT,
    population    INTEGER,
    PRIMARY KEY (location)
);

-- ── 2. Fact table — metrics only, joins cities on query ───────
CREATE TABLE IF NOT EXISTS aq_readings (
    location            VARCHAR(120) NOT NULL,
    measured_at         TIMESTAMP_NTZ,
    us_aqi              FLOAT,
    european_aqi        FLOAT,
    pm2_5               FLOAT,
    pm10                FLOAT,
    carbon_monoxide     FLOAT,
    nitrogen_dioxide    FLOAT,
    sulphur_dioxide     FLOAT,
    ozone               FLOAT,
    dust                FLOAT,
    uv_index            FLOAT,
    uv_index_clear_sky  FLOAT,
    loaded_at           TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

ALTER TABLE aq_readings CLUSTER BY (location, loaded_at);

-- ── 3. File format for CSV loads ─────────────────────────────
CREATE FILE FORMAT IF NOT EXISTS csv_fmt
    TYPE = CSV
    FIELD_OPTIONALLY_ENCLOSED_BY = '"'
    SKIP_HEADER = 1
    NULL_IF = ('', 'NULL');

-- ── 4. Backfill aq_readings from existing historical tables ───
-- Pulls from ANALYTICS.AIR_QUALITY_HISTORICAL
-- Only inserts cities that exist in the new cities table
-- Safe to re-run (NOT EXISTS guard prevents duplicates)

INSERT INTO PUBLIC.aq_readings (
    location, measured_at,
    us_aqi, european_aqi, pm2_5, pm10,
    carbon_monoxide, nitrogen_dioxide, sulphur_dioxide,
    ozone, dust, uv_index, uv_index_clear_sky,
    loaded_at
)
SELECT
    h.location,
    TRY_TO_TIMESTAMP(h.date::VARCHAR)  AS measured_at,
    h.us_aqi,
    h.european_aqi,
    h.pm2_5,
    h.pm10,
    h.carbon_monoxide,
    h.nitrogen_dioxide,
    h.sulphur_dioxide,
    h.ozone,
    h.dust,
    h.uv_index,
    h.uv_index_clear_sky,
    CURRENT_TIMESTAMP()                AS loaded_at
FROM ANALYTICS.AIR_QUALITY_HISTORICAL h
WHERE h.location IN (SELECT location FROM PUBLIC.cities)
  AND NOT EXISTS (
      SELECT 1 FROM PUBLIC.aq_readings r
      WHERE r.location    = h.location
        AND r.measured_at = TRY_TO_TIMESTAMP(h.date::VARCHAR)
  );

-- ── 5. Backward-compatible views (keep existing backend working)
CREATE OR REPLACE VIEW PUBLIC.clean_air_quality AS
SELECT
    r.location,
    c.country,
    c.country_code,
    c.region,
    c.lat,
    c.lon,
    c.population,
    r.us_aqi,
    r.european_aqi,
    r.pm2_5,
    r.pm10,
    r.carbon_monoxide,
    r.nitrogen_dioxide,
    r.sulphur_dioxide,
    r.ozone,
    r.dust,
    r.uv_index,
    r.uv_index_clear_sky,
    r.measured_at,
    r.loaded_at
FROM PUBLIC.aq_readings r
JOIN PUBLIC.cities c USING (location);

CREATE OR REPLACE VIEW PUBLIC.air_quality_combined AS
SELECT
    r.location,
    c.country,
    c.region,
    c.lat,
    c.lon,
    c.population,
    DATE(r.measured_at)    AS date,
    r.us_aqi,
    r.european_aqi,
    r.pm2_5,
    r.pm10,
    r.carbon_monoxide,
    r.nitrogen_dioxide,
    r.sulphur_dioxide,
    r.ozone,
    r.dust,
    r.uv_index,
    r.uv_index_clear_sky,
    r.loaded_at
FROM PUBLIC.aq_readings r
JOIN PUBLIC.cities c USING (location);

-- ── 6. Verify ─────────────────────────────────────────────────
SELECT 'cities'       AS tbl, COUNT(*) AS n FROM PUBLIC.cities
UNION ALL
SELECT 'aq_readings'  AS tbl, COUNT(*) AS n FROM PUBLIC.aq_readings
UNION ALL
SELECT 'clean_air_quality (view)' AS tbl, COUNT(*) AS n FROM PUBLIC.clean_air_quality
UNION ALL
SELECT 'air_quality_combined (view)' AS tbl, COUNT(*) AS n FROM PUBLIC.air_quality_combined;

SELECT MIN(measured_at) AS earliest, MAX(measured_at) AS latest
FROM PUBLIC.aq_readings;