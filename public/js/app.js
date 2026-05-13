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
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        hide('loadingSpinner');
        allPharmacies = data.pharmacies || [];
        if (allPharmacies.length === 0) { show('noDataMsg'); return; }
        renderTable(allPharmacies);
        show('pharmacyTableWrap');
        var badge = $('pharmacyCount');
        if (badge) badge.textContent = allPharmacies.length + ' nöbetçi eczane';
      })
      .catch(function () {
        hide('loadingSpinner');
        show('errorMsg');
      });
  }

  function renderTable(pharmacies) {
    var tbody = $('pharmacyTbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    pharmacies.forEach(function (p, idx) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="text-muted small">' + (idx + 1) + '</td>' +
        '<td><div class="pharmacy-name">' + esc(p.name) + '</div>' +
          (p.dist ? '<div class="text-muted small"><i class="fa-solid fa-map-pin me-1"></i>' + esc(p.dist) + '</div>' : '') +
        '</td>' +
        '<td><div class="pharmacy-address">' + esc(p.address || '—') + '</div></td>' +
        '<td class="pharmacy-phone">' +
          (p.phone ? '<a href="tel:' + esc(p.phone.replace(/\s/g,'')) + '" onclick="trackPhone(this)"><i class="fa-solid fa-phone me-1"></i>' + esc(p.phone) + '</a>' : '<span class="text-muted">—</span>') +
        '</td>' +
        '<td>' +
          '<button class="btn-directions" onclick="showDirections(' +
            JSON.stringify(p.name) + ',' +
            JSON.stringify(p.address || '') + ',' +
            JSON.stringify(p.lat || '') + ',' +
            JSON.stringify(p.lng || '') +
          ')">' +
            '<i class="fa-solid fa-diamond-turn-right me-1"></i>Yol Tarifi' +
          '</button>' +
        '</td>';
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
        var date = tab.getAttribute('data-date');
        if (window.PAGE_ILSLUG) {
          loadPharmacies(window.PAGE_ILSLUG, window.PAGE_ILCESLUG || '', date);
        }
      });
    });
  }

  window.showDirections = function (name, address, lat, lng) {
    var nameEl  = document.getElementById('modalPharmacyName');
    var iframe  = document.getElementById('mapsIframe');
    var spinner = document.getElementById('mapsSpinner');
    var extLink = document.getElementById('mapsExternalLink');
    if (nameEl) nameEl.textContent = name;
    if (iframe)  iframe.style.display = 'none';
    if (spinner) spinner.style.display = '';
    var query = address || name;
    var mapSrc, mapsUrl;
    if (lat && lng) {
      mapSrc  = 'https://maps.google.com/maps?q=' + lat + ',' + lng + '&output=embed&z=16';
      mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng;
    } else {
      mapSrc  = 'https://maps.google.com/maps?q=' + encodeURIComponent(query) + '&output=embed&z=16';
      mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(query);
    }
    if (extLink) extLink.href = mapsUrl;
    if (iframe) {
      iframe.onload = function () { if (spinner) spinner.style.display = 'none'; iframe.style.display = ''; };
      iframe.src = mapSrc;
    }
    var modal = new bootstrap.Modal(document.getElementById('mapsModal'));
    modal.show();
  };

  function initTableSearch() {
    var input = $('tableSearch');
    if (!input) return;
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase().trim();
      if (!q) { renderTable(allPharmacies); return; }
      var filtered = allPharmacies.filter(function (p) {
        return (p.name || '').toLowerCase().includes(q) ||
               (p.address || '').toLowerCase().includes(q) ||
               (p.dist || '').toLowerCase().includes(q);
      });
      renderTable(filtered);
      var badge = $('pharmacyCount');
      if (badge) badge.textContent = filtered.length + ' / ' + allPharmacies.length + ' eczane';
    });
  }

  window.trackPhone = function () {};

  window.doSearch = function () {
    var input = document.getElementById('citySearch');
    if (input) triggerSearch(input.value);
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
    if (!window._illerData) {
      results.innerHTML = '<div class="p-3 text-muted small">Yükleniyor...</div>';
      return;
    }
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
      var icon = m.type === 'il'
        ? '<i class="fa-solid fa-city me-2 text-danger"></i>'
        : '<i class="fa-solid fa-map-pin me-2 text-secondary"></i>';
      return '<a href="' + m.url + '">' + icon + m.label + '</a>';
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
