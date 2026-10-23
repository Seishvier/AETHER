
// =============================================
// AETHER — Weather & Air Intelligence
// File: script.js
// =============================================

// API endpoints: no API key required.
const API = {
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
  weather: "https://api.open-meteo.com/v1/forecast",
  air: "https://air-quality-api.open-meteo.com/v1/air-quality"
};

// Default location: Surabaya, Indonesia.
let currentCity = {
  name: "Surabaya",
  country: "Indonesia",
  latitude: -7.2575,
  longitude: 112.7521
};

let isLoading = false;
let toastTimer;

// ---------------------------------------------
// GENERAL HELPERS
// ---------------------------------------------

const $ = (id) => document.getElementById(id);

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "--";
  }

  return Number(value).toLocaleString("id-ID", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0
  });
}

function weatherInfo(code) {
  const codes = {
    0: ["Cerah", "fa-sun"],
    1: ["Cerah berawan", "fa-cloud-sun"],
    2: ["Berawan sebagian", "fa-cloud-sun"],
    3: ["Berawan", "fa-cloud"],
    45: ["Berkabut", "fa-smog"],
    48: ["Kabut tebal", "fa-smog"],
    51: ["Gerimis ringan", "fa-cloud-rain"],
    53: ["Gerimis", "fa-cloud-rain"],
    55: ["Gerimis lebat", "fa-cloud-showers-heavy"],
    56: ["Gerimis beku", "fa-snowflake"],
    57: ["Gerimis beku lebat", "fa-snowflake"],
    61: ["Hujan ringan", "fa-cloud-rain"],
    63: ["Hujan sedang", "fa-cloud-rain"],
    65: ["Hujan lebat", "fa-cloud-showers-heavy"],
    66: ["Hujan beku", "fa-snowflake"],
    67: ["Hujan beku lebat", "fa-snowflake"],
    71: ["Salju ringan", "fa-snowflake"],
    73: ["Salju sedang", "fa-snowflake"],
    75: ["Salju lebat", "fa-snowflake"],
    77: ["Butiran salju", "fa-snowflake"],
    80: ["Hujan lokal", "fa-cloud-rain"],
    81: ["Hujan lokal sedang", "fa-cloud-showers-heavy"],
    82: ["Hujan lokal lebat", "fa-cloud-showers-heavy"],
    85: ["Hujan salju", "fa-snowflake"],
    86: ["Hujan salju lebat", "fa-snowflake"],
    95: ["Badai petir", "fa-cloud-bolt"],
    96: ["Badai petir dan hujan es", "fa-cloud-bolt"],
    99: ["Badai petir kuat", "fa-cloud-bolt"]
  };

  return codes[code] || ["Kondisi tidak diketahui", "fa-cloud"];
}

function aqiInfo(aqi) {
  if (aqi === null || aqi === undefined || !Number.isFinite(Number(aqi))) {
    return {
      label: "Tidak tersedia",
      color: "#85928b",
      background: "#edf0ec"
    };
  }

  const value = Number(aqi);

  if (value <= 50) {
    return { label: "Baik", color: "#357a4a", background: "#e5f5e8" };
  }

  if (value <= 100) {
    return { label: "Sedang", color: "#92731b", background: "#fff4ce" };
  }

  if (value <= 150) {
    return { label: "Tidak sehat bagi kelompok sensitif", color: "#a65b24", background: "#fff0df" };
  }

  if (value <= 200) {
    return { label: "Tidak sehat", color: "#b33c42", background: "#ffeaeb" };
  }

  if (value <= 300) {
    return { label: "Sangat tidak sehat", color: "#8b4da6", background: "#f3e7fa" };
  }

  return { label: "Berbahaya", color: "#852f3b", background: "#f8e3e7" };
}

function uvInfo(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "Data tidak tersedia";
  }

  const uv = Number(value);

  if (uv < 3) return "Rendah";
  if (uv < 6) return "Sedang";
  if (uv < 8) return "Tinggi";
  if (uv < 11) return "Sangat tinggi";
  return "Ekstrem";
}

function formatDate(dateString, options = {}) {
  // API times are local to the requested location.
  // Parse the calendar date without changing its timezone.
  const [year, month, day] = dateString.split("T")[0].split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    ...options
  }).format(date);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Permintaan data gagal (${response.status}).`);
  }

  return response.json();
}

function makeURL(base, params) {
  const url = new URL(base);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

function getClosestHourlyIndex(times, currentTime) {
  if (!Array.isArray(times) || times.length === 0) return -1;

  // Open-Meteo returns local ISO strings when timezone=auto.
  // Match the current hour in the location's local time.
  const hour = String(currentTime || "").slice(0, 13);

  const exactIndex = times.findIndex((time) => time.startsWith(hour));

  if (exactIndex >= 0) return exactIndex;

  return 0;
}

// ---------------------------------------------
// CITY SEARCH
// ---------------------------------------------

async function searchCity() {
  const query = $("city-input").value.trim();

  if (query.length < 2) {
    showToast("Masukkan nama kota terlebih dahulu.");
    return;
  }

  setText("search-status", "Mencari kota...");

  try {
    const url = makeURL(API.geocoding, {
      name: query,
      count: 8,
      language: "id",
      format: "json"
    });

    const data = await fetchJSON(url);

    if (!data.results || data.results.length === 0) {
      setText("search-status", "Kota tidak ditemukan. Coba nama kota lain.");
      showToast("Tidak menemukan kota tersebut.");
      return;
    }

    // Prefer a result in Indonesia when available.
    const indonesiaResult = data.results.find(
      (place) => place.country_code === "ID"
    );

    const place = indonesiaResult || data.results[0];

    currentCity = {
      name: place.name,
      country: place.country || "Unknown country",
      latitude: place.latitude,
      longitude: place.longitude
    };

    $("city-input").value = "";
    await loadDashboard();
  } catch (error) {
    console.error("City search error:", error);
    setText("search-status", "Pencarian gagal. Periksa koneksi internet.");
    showToast("Tidak dapat mencari kota saat ini.");
  }
}

// ---------------------------------------------
// FETCH WEATHER AND AIR QUALITY
// ---------------------------------------------

async function loadDashboard() {
  if (isLoading) return;

  isLoading = true;

  const refreshButton = $("refresh-button");
  refreshButton.disabled = true;

  setText("search-status", "Mengambil data cuaca dan kualitas udara...");

  const weatherURL = makeURL(API.weather, {
    latitude: currentCity.latitude,
    longitude: currentCity.longitude,
    timezone: "auto",
    forecast_days: 7,
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m"
    ].join(","),
    hourly: [
      "uv_index",
      "precipitation_probability"
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max"
    ].join(",")
  });

  const airURL = makeURL(API.air, {
    latitude: currentCity.latitude,
    longitude: currentCity.longitude,
    timezone: "auto",
    forecast_days: 1,
    hourly: [
      "us_aqi",
      "pm2_5",
      "pm10"
    ].join(",")
  });

  try {
    const [weather, air] = await Promise.all([
      fetchJSON(weatherURL),
      fetchJSON(airURL)
    ]);

    renderWeather(weather);
    renderAirQuality(weather, air);
    renderRecommendations(weather, air);

    setText(
      "city-name",
      `${currentCity.name}, ${currentCity.country}`
    );

    setText(
      "last-updated",
      formatDate(weather.current.time, {
        hour: "2-digit",
        minute: "2-digit"
      })
    );

    setText(
      "search-status",
      `Data tersedia untuk ${currentCity.name}. Waktu mengikuti zona waktu lokasi.`
    );

    showToast(`Data ${currentCity.name} berhasil diperbarui.`);
  } catch (error) {
    console.error("Dashboard error:", error);

    setText(
      "search-status",
      "Data tidak dapat dimuat. Periksa koneksi dan coba lagi."
    );

    showToast("Gagal mengambil data. Silakan coba lagi.");
  } finally {
    isLoading = false;
    refreshButton.disabled = false;
  }
}

// ---------------------------------------------
// RENDER CURRENT WEATHER AND FORECAST
// ---------------------------------------------

function renderWeather(data) {
  const current = data.current;
  const info = weatherInfo(current.weather_code);

  setText("weather-description", info[0]);
  setText("temperature", formatNumber(current.temperature_2m));
  setText("feels-like", `${formatNumber(current.apparent_temperature)}°C`);
  setText("humidity", `${formatNumber(current.relative_humidity_2m)}%`);
  setText("wind-speed", `${formatNumber(current.wind_speed_10m)} km/j`);
  setText("precipitation", `${formatNumber(current.precipitation, 1)} mm`);

  $("weather-symbol").innerHTML = `<i class="fa-solid ${info[1]}"></i>`;

  setText("metric-feels", `${formatNumber(current.apparent_temperature)}°C`);
  setText("metric-humidity", `${formatNumber(current.relative_humidity_2m)}%`);
  setText("metric-wind", `${formatNumber(current.wind_speed_10m)} km/j`);

  const times = data.hourly?.time || [];
  const uvIndex = data.hourly?.uv_index || [];
  const hourIndex = getClosestHourlyIndex(times, current.time);
  const uv = hourIndex >= 0 ? uvIndex[hourIndex] : null;

  setText("uv-index", formatNumber(uv, 1));
  setText("uv-label", uvInfo(uv));

  renderForecast(data.daily);
}

function renderForecast(daily) {
  const grid = $("forecast-grid");
  grid.replaceChildren();

  if (!daily || !daily.time || daily.time.length === 0) {
    grid.textContent = "Prakiraan belum tersedia.";
    return;
  }

  daily.time.forEach((date, index) => {
    const info = weatherInfo(daily.weather_code[index]);
    const high = daily.temperature_2m_max[index];
    const low = daily.temperature_2m_min[index];
    const rain = daily.precipitation_probability_max[index];

    const article = document.createElement("article");
    article.className = `forecast-day${index === 0 ? " today" : ""}`;

    const dayName = index === 0
      ? "Hari ini"
      : formatDate(date, { weekday: "short" });

    const dayDate = formatDate(date, {
      day: "numeric",
      month: "short"
    });

    // Use DOM elements and textContent for external API values.
    const name = document.createElement("span");
    name.className = "day-name";
    name.textContent = dayName;

    const dateLabel = document.createElement("span");
    dateLabel.className = "day-date";
    dateLabel.textContent = dayDate;

    const icon = document.createElement("div");
    icon.className = "forecast-icon";
    icon.innerHTML = `<i class="fa-solid ${info[1]}"></i>`;
    icon.setAttribute("aria-label", info[0]);
    icon.title = info[0];

    const temps = document.createElement("div");
    temps.className = "temps";

    const highTemp = document.createElement("strong");
    highTemp.textContent = `${formatNumber(high)}°`;

    const lowTemp = document.createElement("span");
    lowTemp.className = "low-temp";
    lowTemp.textContent = `${formatNumber(low)}°`;

    temps.append(highTemp, lowTemp);

    const rainLabel = document.createElement("span");
    rainLabel.className = "rain-chance";
    rainLabel.textContent = rain == null ? "Hujan --" : `Hujan ${rain}%`;

    article.append(name, dateLabel, icon, temps, rainLabel);
    grid.appendChild(article);
  });
}

// ---------------------------------------------
// RENDER AIR QUALITY
// ---------------------------------------------

function renderAirQuality(weather, air) {
  const times = air.hourly?.time || [];
  const index = getClosestHourlyIndex(times, weather.current.time);

  const aqi = index >= 0 ? air.hourly.us_aqi?.[index] : null;
  const pm25 = index >= 0 ? air.hourly.pm2_5?.[index] : null;
  const pm10 = index >= 0 ? air.hourly.pm10?.[index] : null;

  setText("aqi-value", formatNumber(aqi));
  setText("pm25", `${formatNumber(pm25, 1)} `);
  setText("pm10", `${formatNumber(pm10, 1)} `);

  const info = aqiInfo(aqi);
  const badge = $("aqi-label");

  badge.textContent = info.label;
  badge.style.color = info.color;
  badge.style.backgroundColor = info.background;
}

// ---------------------------------------------
// HEALTH AND AGRICULTURAL RECOMMENDATIONS
// ---------------------------------------------

function renderRecommendations(weather, air) {
  const current = weather.current;
  const daily = weather.daily;
  const times = air.hourly?.time || [];
  const airIndex = getClosestHourlyIndex(times, current.time);

  const aqi = airIndex >= 0 ? air.hourly.us_aqi?.[airIndex] : null;
  const uvTimes = weather.hourly?.time || [];
  const uvIndex = getClosestHourlyIndex(uvTimes, current.time);
  const uv = uvIndex >= 0 ? weather.hourly.uv_index?.[uvIndex] : null;

  const temp = current.temperature_2m;
  const wind = current.wind_speed_10m;
  const rainNow = current.precipitation;
  const rainChance = daily.precipitation_probability_max?.[0];

  // Health recommendations.
  const healthList = $("health-list");
  healthList.replaceChildren();

  let summary = "Periksa cuaca dan kualitas udara sebelum beraktivitas.";
  const healthAdvice = [];

  if (aqi == null) {
    healthAdvice.push(
      "Indeks kualitas udara belum tersedia. Jangan menganggap udara bersih hanya karena data kosong."
    );
  } else if (aqi <= 50) {
    summary = "Kualitas udara tergolong baik menurut US AQI.";
    healthAdvice.push(
      "Aktivitas luar ruang umumnya dapat dilakukan jika kondisi tubuh dan cuaca mendukung."
    );
  } else if (aqi <= 100) {
    summary = "Kualitas udara sedang. Kelompok sensitif sebaiknya lebih berhati-hati.";
    healthAdvice.push(
      "Orang yang sensitif terhadap polusi perlu memperhatikan gejala saat beraktivitas di luar."
    );
  } else if (aqi <= 150) {
    summary = "Udara dapat berdampak pada kelompok sensitif.";
    healthAdvice.push(
      "Anak-anak, lansia, dan orang dengan gangguan pernapasan sebaiknya mengurangi aktivitas berat di luar."
    );
  } else {
    summary = "Polusi udara meningkat. Pertimbangkan mengurangi paparan di luar ruang.";
    healthAdvice.push(
      "Kurangi aktivitas luar ruang yang berat dan ikuti informasi resmi kualitas udara setempat."
    );
  }

  if (temp != null && temp >= 35) {
    healthAdvice.push(
      "Suhu sangat panas: pilih tempat teduh, minum air secara teratur, dan hindari aktivitas berat saat terik."
    );
  } else if (temp != null && temp >= 30) {
    healthAdvice.push(
      "Cuaca hangat: bawa air minum dan beristirahat di tempat teduh jika diperlukan."
    );
  } else {
    healthAdvice.push(
      "Sesuaikan pakaian dan intensitas aktivitas dengan suhu serta kenyamanan tubuh."
    );
  }

  if (uv != null && uv >= 6) {
    healthAdvice.push(
      "Indeks UV tinggi: gunakan perlindungan matahari dan cari tempat teduh."
    );
  }

  if (rainChance != null && rainChance >= 60) {
    healthAdvice.push(
      "Peluang hujan cukup tinggi. Periksa prakiraan terbaru sebelum bepergian."
    );
  }

  healthAdvice.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    healthList.appendChild(li);
  });

  setText("health-summary", summary);

  // Agricultural recommendations.
  // These are preliminary rules, not crop-specific irrigation calculations.
  if (rainChance == null) {
    setText(
      "irrigation-advice",
      "Data peluang hujan tidak tersedia. Periksa prakiraan lokal dan kelembapan tanah sebelum mengatur irigasi."
    );
  } else if (rainChance >= 70 || (rainNow != null && rainNow >= 2)) {
    setText(
      "irrigation-advice",
      `Peluang hujan hari ini ${rainChance}%. Periksa kelembapan tanah dan drainase sebelum menambah irigasi.`
    );
  } else if (rainChance >= 35) {
    setText(
      "irrigation-advice",
      `Peluang hujan hari ini ${rainChance}%. Periksa kondisi tanah dan kebutuhan tanaman sebelum menentukan jadwal irigasi.`
    );
  } else {
    setText(
      "irrigation-advice",
      `Peluang hujan hari ini ${rainChance}%. Evaluasi kelembapan tanah; irigasi mungkin diperlukan jika tanaman membutuhkan air.`
    );
  }

  if (temp == null) {
    setText("heat-advice", "Data suhu belum tersedia.");
  } else if (temp >= 35) {
    setText(
      "heat-advice",
      "Suhu tinggi. Pantau tanaman terhadap gejala stres panas dan periksa ketersediaan air."
    );
  } else if (temp >= 30) {
    setText(
      "heat-advice",
      "Cuaca hangat. Pantau kebutuhan air tanaman dan kondisi tanah, terutama pada lahan terbuka."
    );
  } else {
    setText(
      "heat-advice",
      "Gunakan suhu sebagai salah satu pertimbangan. Kebutuhan optimal bergantung pada jenis dan fase tanaman."
    );
  }

  if (wind == null) {
    setText("field-advice", "Data angin belum tersedia.");
  } else if (wind >= 30) {
    setText(
      "field-advice",
      "Angin cukup kencang. Tinjau keamanan pekerjaan lapangan dan hindari penyemprotan saat angin tidak sesuai."
    );
  } else if (rainChance != null && rainChance >= 60) {
    setText(
      "field-advice",
      "Periksa prakiraan hujan sebelum pemupukan, penyemprotan, atau kegiatan lapangan yang sensitif terhadap hujan."
    );
  } else {
    setText(
      "field-advice",
      "Tinjau cuaca sebelum bekerja. Pilih waktu yang sesuai untuk kegiatan lapangan dan karakteristik tanaman."
    );
  }
}

// ---------------------------------------------
// GEOLOCATION
// ---------------------------------------------

function useMyLocation() {
  if (!("geolocation" in navigator)) {
    showToast("Browser ini tidak mendukung geolokasi.");
    return;
  }

  if (!window.isSecureContext) {
    showToast("Lokasi memerlukan HTTPS atau localhost.");
    return;
  }

  const button = $("location-button");
  button.disabled = true;
  setText("search-status", "Meminta izin lokasi...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      currentCity = {
        name: "Lokasi saya",
        country: "Koordinat perangkat",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      button.disabled = false;
      await loadDashboard();
    },
    (error) => {
      button.disabled = false;

      const messages = {
        1: "Izin lokasi ditolak. Kamu tetap bisa mencari kota secara manual.",
        2: "Lokasi tidak tersedia. Coba lagi atau cari kota secara manual.",
        3: "Permintaan lokasi melewati batas waktu."
      };

      const message = messages[error.code] || "Lokasi tidak dapat diakses.";
      setText("search-status", message);
      showToast(message);
    },
    {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

// ---------------------------------------------
// QR CODE AND SHARING
// ---------------------------------------------

function updateQRCode() {
  const qrImage = $("qr-image");
  const status = $("qr-status");

  const protocol = window.location.protocol;
  const url = window.location.href.split("#")[0];

  // Do not create a QR for a local file or a localhost-only address.
  if (
    !["https:", "http:"].includes(protocol) ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    qrImage.removeAttribute("src");
    qrImage.alt = "QR code akan tersedia setelah website dipublikasikan";
    status.textContent =
      "Publikasikan website melalui GitHub Pages terlebih dahulu. QR code akan muncul otomatis.";
    return;
  }

  qrImage.src =
    "https://api.qrserver.com/v1/create-qr-code/" +
    `?size=220x220&margin=8&data=${encodeURIComponent(url)}`;

  qrImage.alt = "Pindai untuk membuka AETHER";
  status.textContent = "Pindai untuk membuka alamat website ini.";
}

async function copySiteLink() {
  const url = window.location.href.split("#")[0];

  if (
    !["https:", "http:"].includes(window.location.protocol) ||
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    showToast("Publikasikan website terlebih dahulu agar memiliki alamat publik.");
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast("Alamat website berhasil disalin.");
  } catch (error) {
    console.error("Clipboard error:", error);
    showToast("Tidak dapat menyalin otomatis. Salin alamat dari bilah browser.");
  }
}

// ---------------------------------------------
// NAVIGATION AND INITIALIZATION
// ---------------------------------------------

function setupNavigation() {
  const sidebar = $("sidebar");
  const menuToggle = $("menu-toggle");
  const navLinks = document.querySelectorAll(".nav-link");

  menuToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute(
      "aria-label",
      open ? "Tutup navigasi" : "Buka navigasi"
    );
  });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.forEach((item) => item.classList.remove("active"));
      link.classList.add("active");

      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });

  // Update the active navigation link while scrolling.
  const sections = document.querySelectorAll(".page-section");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        navLinks.forEach((link) => {
          const active =
            link.getAttribute("href") === `#${visible.target.id}`;

          link.classList.toggle("active", active);
        });
      },
      {
        rootMargin: "-15% 0px -60% 0px",
        threshold: [0, 0.2, 0.5]
      }
    );

    sections.forEach((section) => observer.observe(section));
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      sidebar.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  });
}

function initialize() {
  setText(
    "today-date",
    new Intl.DateTimeFormat("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date())
  );

  setText("footer-year", String(new Date().getFullYear()));

  $("search-button").addEventListener("click", searchCity);

  $("city-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") searchCity();
  });

  $("refresh-button").addEventListener("click", loadDashboard);
  $("location-button").addEventListener("click", useMyLocation);
  $("copy-link").addEventListener("click", copySiteLink);

  setupNavigation();
  updateQRCode();
  loadDashboard();
}

document.addEventListener("DOMContentLoaded", initialize);
