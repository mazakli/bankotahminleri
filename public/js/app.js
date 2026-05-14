(function () {
  'use strict';

  var currentDate = '';
  var allPharmacies = [];
  var _leafletMap = null;

  function $(id) { return document.getElementById(id); }
  function show(id) { var el = $(id); if (el) el.style.display = ''; }
  function hide(id) { var el = $(id); if (el) el.style.display = 'none'; }

  function loadPharmacies(citySlug, districtSlug, date) {
    if (!citySlug || !date) return;
    currentDate = date;
    show('loadingSpinner');
    hide('pharmacyTableWrap');
    hide('noDataMsg');
    hide('errorMsg');

    var url = '/api/eczaneler?il=' + encodeURIComponent(citySlug) + '&tarih=' + encodeURIComponent(date);
    if (districtSlug) url += '&ilce=' + encodeURIComponent(districtSlug);

    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        hide('loadingSpinner');
        allPharmacies = data.pharmacies || [];
        if (allPharmacies.length === 0) { show('noDataMsg'); return; }
        renderTable(allPharmacies);
        show('pharmacyTableWrap');
        var badge = $('pharmacyCount');
        if (badge) badge.textContent = allPharmacies.length + ' nöbetçi eczane';
      })
      .catch(function () { hide('loadingSpinner'); show('errorMsg'); });
  }

  function renderTable(pharmacies) {
    var tbody = $('pharmacyTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    pharmacies.forEach(function (p, idx) {
      var tr = document.createElement('tr');

      var addressHtml = '';
      if (p.dist) addressHtml += '<div class="text-muted small mb-1"><i class="fa-solid fa-map-pin me-1"></i>' + esc(p.dist) + '</div>';
      addressHtml += '<div>' + esc(p.address || '—') + '</div>';

      var btn = document.createElement('button');
      btn.className = 'btn-directions';
      btn.innerHTML = '<i class="fa-solid fa-diamond-turn-right me-1"></i>Yol Tarifi';
      btn.dataset.name    = p.name    || '';
      btn.dataset.address = p.address || '';
      btn.dataset.lat     = p.lat     || '';
      btn.dataset.lng     = p.lng     || '';
      btn.addEventListener('click', function () {
        showDirections(this.dataset.name, this.dataset.address, this.dataset.lat, this.dataset.lng);
      });

      tr.innerHTML =
        '<td class="text-muted small">' + (idx + 1) + '</td>' +
        '<td><div class="pharmacy-name">' + esc(p.name) + '</div></td>' +
        '<td class="pharmacy-address">' + addressHtml + '</td>' +
        '<td class="pharmacy-phone">' +
          (p.phone
            ? '<a href="tel:' + esc(p.phone.replace(/\s/g, '')) + '"><i class="fa-solid fa-phone me-1"></i>' + esc(p.phone) + '</a>'
            : '<span class="text-muted">—</span>') +
        '</td>' +
        '<td></td>';

      tr.lastElementChild.appendChild(btn);
      tbody.appendChild(tr);
    });
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.showDirections = function (name, address, lat, lng) {
    var nameEl  = $('modalPharmacyName');
    var extLink = $('mapsExternalLink');
    var modalEl = $('mapsModal');
    if (!modalEl) return;

    if (nameEl) nameEl.textContent = name;

    var fLat = lat ? parseFloat(lat) : null;
    var fLng = lng ? parseFloat(lng) : null;

    var mapsUrl = (fLat && fLng)
      ? 'https://www.google.com/maps/dir/?api=1&destination=' + fLat + ',' + fLng
      : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(address || name);
    if (extLink) extLink.href = mapsUrl;

    if (_leafletMap) { _leafletMap.remove(); _leafletMap = null; }

    var modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    function onShown() {
      modalEl.removeEventListener('shown.bs.modal', onShown);
      var container = $('mapContainer');
      if (!container) return;

      if (!fLat || !fLng) {
        container.innerHTML = '<div class="p-4 text-center text-muted">Koordinat bilgisi bulunamadı. Google Maps\'te açmak için aşağıdaki butonu kullanın.</div>';
        return;
      }

      var destLL = L.latLng(fLat, fLng);
      _leafletMap = L.map(container).setView(destLL, 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(_leafletMap);

      L.marker(destLL)
        .addTo(_leafletMap)
        .bindPopup('<strong>' + name + '</strong><br><small>' + (address || '') + '</small>')
        .openPopup();

      _leafletMap.invalidateSize();

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            var userLL = L.latLng(pos.coords.latitude, pos.coords.longitude);
            L.Routing.control({
              waypoints: [userLL, destLL],
              router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1'
              }),
              lineOptions: {
                styles: [{ color: '#dc3545', weight: 5, opacity: 0.8 }]
              },
              show: false,
              addWaypoints: false,
              routeWhileDragging: false,
              fitSelectedRoutes: true,
              showAlternatives: false,
              createMarker: function (i, wp) {
                if (i === 0) {
                  return L.marker(wp.latLng).bindPopup('Konumunuz');
                }
                return L.marker(wp.latLng)
                  .bindPopup('<strong>' + name + '</strong>');
              }
            }).addTo(_leafletMap);
          },
          function () {},
          { timeout: 6000, maximumAge: 60000 }
        );
      }
    }

    modalEl.addEventListener('shown.bs.modal', onShown);
    modal.show();
  };

  var modalEl = document.getElementById('mapsModal');
  if (modalEl) {
    modalEl.addEventListener('hidden.bs.modal', function () {
      if (_leafletMap) { _leafletMap.remove(); _leafletMap = null; }
    });
  }

  function initTableSearch() {
    var input = $('tableSearch');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      if (!q) { renderTable(allPharmacies); return; }
      var filtered = allPharmacies.filter(function (p) {
        return (p.name    || '').toLowerCase().includes(q) ||
               (p.address || '').toLowerCase().includes(q) ||
               (p.dist    || '').toLowerCase().includes(q);
      });
      renderTable(filtered);
      var badge = $('pharmacyCount');
      if (badge) badge.textContent = filtered.length + ' / ' + allPharmacies.length + ' eczane';
    });
  }

  window.trackPhone = function () {};
  window.doSearch   = function () { var i = document.getElementById('citySearch'); if (i) triggerSearch(i.value); };

  window.findNearestPharmacy = function () {
    var btnEl    = document.getElementById('btnNearest');
    var resultEl = document.getElementById('nearestResult');
    if (!resultEl) return;
    if (allPharmacies.length === 0) {
      resultEl.textContent = 'Önce eczane listesinin yüklenmesini bekleyin.';
      return;
    }
    if (!navigator.geolocation) {
      resultEl.textContent = 'Tarayıcınız konum özelliğini desteklemiyor.';
      return;
    }
    if (btnEl) btnEl.disabled = true;
    resultEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Konum alınıyor...';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var nearest = null;
        var minDist = Infinity;
        allPharmacies.forEach(function (p) {
          if (!p.lat || !p.lng) return;
          var d = Math.pow(parseFloat(p.lat) - lat, 2) + Math.pow(parseFloat(p.lng) - lng, 2);
          if (d < minDist) { minDist = d; nearest = p; }
        });
        if (btnEl) btnEl.disabled = false;
        if (!nearest) {
          resultEl.textContent = 'Koordinat bilgisi bulunan eczane bulunamadı.';
          return;
        }
        resultEl.textContent = '';
        window.showDirections(nearest.name, nearest.address, nearest.lat, nearest.lng);
      },
      function () {
        if (btnEl) btnEl.disabled = false;
        resultEl.textContent = 'Konum izni verilmedi veya alınamadı.';
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  function initHomeSearch() {
    var input = document.getElementById('citySearch');
    if (!input) return;
    var results = document.getElementById('searchResults');
    if (!results) return;
    input.addEventListener('input', function () { triggerSearch(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { var first = results.querySelector('a'); if (first) first.click(); }
    });
    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !results.contains(e.target)) results.innerHTML = '';
    });
  }

  function triggerSearch(val) {
    var results = document.getElementById('searchResults');
    if (!results) return;
    var q = val.trim().toLowerCase();
    if (q.length < 2) { results.innerHTML = ''; return; }
    if (!window._illerData) { results.innerHTML = '<div class="p-3 text-muted small">Yükleniyor...</div>'; return; }
    var matches = [];
    window._illerData.forEach(function (il) {
      if (il.name.toLowerCase().includes(q) || il.slug.includes(q))
        matches.push({ label: il.name, url: '/nobetci-' + il.slug, type: 'il' });
      il.districts.forEach(function (d) {
        if (d.name.toLowerCase().includes(q) || d.slug.includes(q))
          matches.push({ label: il.name + ' › ' + d.name, url: '/nobetci-' + il.slug + '-' + d.slug, type: 'ilce' });
      });
    });
    matches = matches.slice(0, 12);
    if (matches.length === 0) { results.innerHTML = '<div class="p-3 text-muted small">Sonuç bulunamadı</div>'; return; }
    results.innerHTML = matches.map(function (m) {
      return '<a href="' + m.url + '">' +
        (m.type === 'il' ? '<i class="fa-solid fa-city me-2 text-danger"></i>' : '<i class="fa-solid fa-map-pin me-2 text-secondary"></i>') +
        m.label + '</a>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTableSearch();
    initHomeSearch();
    if (window.PAGE_ILSLUG && window.PAGE_TODAY) {
      loadPharmacies(window.PAGE_ILSLUG, window.PAGE_ILCESLUG || '', window.PAGE_TODAY);
    }
  });

})();
