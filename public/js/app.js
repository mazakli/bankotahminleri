(function () {
  'use strict';

  var currentDate = '';
  var allPharmacies = [];

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

  function initDayTabs() {
    var tabs = document.querySelectorAll('.day-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        if (window.PAGE_ILSLUG) {
          loadPharmacies(window.PAGE_ILSLUG, window.PAGE_ILCESLUG || '', tab.getAttribute('data-date'));
        }
      });
    });
  }

  window.showDirections = function (name, address, lat, lng) {
    var nameEl  = document.getElementById('modalPharmacyName');
    var iframe  = document.getElementById('mapsIframe');
    var spinner = document.getElementById('mapsSpinner');
    var extLink = document.getElementById('mapsExternalLink');
    var modalEl = document.getElementById('mapsModal');
    if (!modalEl) return;

    if (nameEl) nameEl.textContent = name;

    // Reset state
    if (iframe)  { iframe.src = 'about:blank'; iframe.style.display = 'none'; }
    if (spinner) spinner.style.display = '';

    var mapsUrl, mapSrc;
    if (lat && lng) {
      var fLat = parseFloat(lat), fLng = parseFloat(lng);
      mapSrc  = 'https://www.openstreetmap.org/export/embed.html'
              + '?bbox=' + (fLng - 0.005) + ',' + (fLat - 0.005) + ',' + (fLng + 0.005) + ',' + (fLat + 0.005)
              + '&layer=mapnik&marker=' + fLat + ',' + fLng;
      mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lng);
    } else {
      var q = address || name;
      mapSrc  = 'https://www.openstreetmap.org/export/embed.html?bbox=26.0,36.0,45.0,42.0&layer=mapnik';
      mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(q);
    }

    if (extLink) extLink.href = mapsUrl;

    // Wait for modal animation to finish, then load iframe
    function onShown() {
      modalEl.removeEventListener('shown.bs.modal', onShown);
      if (iframe) {
        iframe.onload = function () {
          if (spinner) spinner.style.display = 'none';
          iframe.style.display = '';
        };
        iframe.src = mapSrc;
      }
    }
    modalEl.addEventListener('shown.bs.modal', onShown);

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  };

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
    initDayTabs();
    initTableSearch();
    initHomeSearch();
    if (window.PAGE_ILSLUG) {
      var activeTab = document.querySelector('.day-tab.active');
      var date = activeTab ? activeTab.getAttribute('data-date') : '';
      if (date) loadPharmacies(window.PAGE_ILSLUG, window.PAGE_ILCESLUG || '', date);
    }
  });

})();
