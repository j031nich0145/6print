-- 6print PostgreSQL schema
-- Replaces Snowflake carbon_db.PUBLIC schema

CREATE TABLE IF NOT EXISTS cities (
    location    VARCHAR(255) PRIMARY KEY,
    country     VARCHAR(255),
    region      VARCHAR(100),
    province    VARCHAR(255),
    lat         FLOAT,
    lon         FLOAT,
    population  INTEGER
);

CREATE TABLE IF NOT EXISTS aq_readings (
    id                  SERIAL PRIMARY KEY,
    location            VARCHAR(255) REFERENCES cities(location),
    measured_at         TIMESTAMP NOT NULL,
    pm2_5               FLOAT,
    pm10                FLOAT,
    carbon_monoxide     FLOAT,
    nitrogen_dioxide    FLOAT,
    sulphur_dioxide     FLOAT,
    ozone               FLOAT,
    dust                FLOAT,
    uv_index            FLOAT,
    uv_index_clear_sky  FLOAT,
    us_aqi              FLOAT,
    european_aqi        FLOAT,
    loaded_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aq_location_time ON aq_readings (location, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_aq_loaded_at ON aq_readings (loaded_at DESC);

-- Latest reading per city (replaces clean_air_quality)
CREATE OR REPLACE VIEW clean_air_quality AS
SELECT DISTINCT ON (r.location)
    r.location, c.country, c.region, c.province, c.lat, c.lon, c.population,
    r.pm2_5, r.pm10, r.carbon_monoxide, r.nitrogen_dioxide, r.sulphur_dioxide,
    r.ozone, r.dust, r.uv_index, r.uv_index_clear_sky,
    r.us_aqi, r.european_aqi, r.measured_at
FROM aq_readings r
JOIN cities c ON r.location = c.location
ORDER BY r.location, r.loaded_at DESC;

-- Daily averages, all history (replaces air_quality_combined)
CREATE OR REPLACE VIEW air_quality_combined AS
SELECT
    DATE(measured_at) AS date,
    r.location, c.country, c.region, c.province, c.lat, c.lon, c.population,
    AVG(us_aqi) AS us_aqi,
    AVG(european_aqi) AS european_aqi,
    AVG(pm2_5) AS pm2_5,
    AVG(pm10) AS pm10,
    AVG(carbon_monoxide) AS carbon_monoxide,
    AVG(nitrogen_dioxide) AS nitrogen_dioxide,
    AVG(sulphur_dioxide) AS sulphur_dioxide,
    AVG(ozone) AS ozone,
    AVG(dust) AS dust,
    AVG(uv_index) AS uv_index
FROM aq_readings r
JOIN cities c ON r.location = c.location
GROUP BY DATE(measured_at), r.location, c.country, c.region, c.province, c.lat, c.lon, c.population;