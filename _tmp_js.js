// ===== POST API =====
async function apiPost(path, body) {
  const res = await fetch(SUPABASE_URL + path, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
}

// ===== 1: 議事録一括送付 =====
async function bulkGijiroku() {
  const targets = allRecords.filter(r => !r.left_at);
  if (!targets.length) { showToast('対象会員がいません', 'error'); return; }
  if (!confirm('全会員 ' + targets.length + ' 名に議事録送付を登録します。よろしいですか？')) return;
  const today = new Date().toLocaleDateString('sv-SE');
  const records = targets.map(r => ({ customer_id: r.id, category: '送付', sub_category: '議事録', action_date: today }));
  try {
    showToast('登録中...', 'success');
    for (let i = 0; i < records.length; i += 500) await apiPost('/rest/v1/actions', records.slice(i, i + 500));
    showToast('✅ ' + records.length + ' 件の議事録送付を登録しました', 'success');
  } catch(e) { showToast('エラー: ' + e.message, 'error'); }
}

// ===== 2: 催促一括送付 =====
async function bulkSasoku() {
  const targets = allRecords.filter(r => r.in_arrears && !r.left_at);
  if (!targets.length) { showToast('催促対象の会員がいません', 'error'); return; }
  if (!confirm('催促対象 ' + targets.length + ' 名に未納催促送付を登録します。よろしいですか？')) return;
  const today = new Date().toLocaleDateString('sv-SE');
  const records = targets.map(r => ({ customer_id: r.id, category: '送付', sub_category: '未納催促', action_date: today }));
  try {
    showToast('登録中...', 'success');
    for (let i = 0; i < records.length; i += 500) await apiPost('/rest/v1/actions', records.slice(i, i + 500));
    showToast('✅ ' + records.length + ' 件の催促送付を登録しました', 'success');
  } catch(e) { showToast('エラー: ' + e.message, 'error'); }
}

// ===== 3: ラベルPDF出力 =====
function printLabels() {
  const active  = allRecords.filter(r => !r.left_at && !r.no_mail);
  const normal  = active.filter(r => !r.in_arrears);
  const arrears = active.filter(r =>  r.in_arrears);
  if (!active.length) { showToast('出力対象の会員がいません', 'error'); return; }

  function getAddr(r) {
    if (r.mail_destination === '会社') {
      return {
        postal: '',
        addr: [r.company_prefecture, r.company_city, r.company_address, r.company_building].filter(Boolean).join('<br>'),
        name: r.name || ''
      };
    }
    return {
      postal: r.postal_code ? '〒' + r.postal_code : '',
      addr: [r.prefecture, r.city, r.address, r.building].filter(Boolean).join('<br>'),
      name: r.name || ''
    };
  }

  function labelDiv(r, cls) {
    const a = getAddr(r);
    return '<div class="label' + (cls ? ' ' + cls : '') + '">'
      + (a.postal ? '<div class="postal">' + a.postal + '</div>' : '')
      + '<div class="addr">' + (a.addr || '—') + '</div>'
      + '<div class="recip">' + esc(a.name) + '　様</div>'
      + '</div>';
  }

  const COLS = 3;
  const pad = (normal.length % COLS > 0) ? COLS - (normal.length % COLS) : 0;
  const emptyDivs = '<div class="label label-empty"></div>'.repeat(pad);
  const sepDiv = arrears.length > 0
    ? '<div class="sep-row"><span>━━━━━　以下　催促あり　━━━━━</span></div>'
    : '';
  const labelHtml = normal.map(function(r){ return labelDiv(r,''); }).join('')
    + emptyDivs + sepDiv
    + arrears.map(function(r){ return labelDiv(r,'label-arrears'); }).join('');

  const css = [
    '* { box-sizing: border-box; margin: 0; padding: 0; }',
    'body { font-family: "Noto Sans JP","MS Gothic",sans-serif; background: #f5f5f5; }',
    '.toolbar-print { position:sticky;top:0;z-index:10;background:#1a3a5c;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:12px; }',
    '.toolbar-print button { padding:8px 22px;border:none;border-radius:6px;font-size:14px;font-family:inherit;cursor:pointer;font-weight:700; }',
    '.btn-print { background:#00a8e8;color:#fff; }',
    '.btn-close { background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3)!important; }',
    '.info { margin-left:auto;font-size:13px;opacity:0.75; }',
    '.page { width:210mm;margin:8mm auto;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,0.15); }',
    '.label-grid { display:grid;grid-template-columns:repeat(3,1fr);padding:8mm 4mm;gap:0; }',
    '.label { width:66mm;min-height:38mm;padding:4mm 5mm 4mm 7mm;border:0.3px solid #bbb;display:flex;flex-direction:column;justify-content:center;gap:2px; }',
    '.label-empty { border-color:rgba(0,0,0,0.06); }',
    '.label-arrears { background:#fff9f0; }',
    '.postal { font-size:8.5pt;letter-spacing:2px;color:#333;margin-bottom:1mm; }',
    '.addr { font-size:8.5pt;line-height:1.6;color:#222; }',
    '.recip { font-size:11.5pt;font-weight:700;text-align:right;margin-top:2.5mm;padding-right:3mm; }',
    '.sep-row { grid-column:1/-1;text-align:center;padding:5mm 0;border-top:2px dashed #c00;border-bottom:1px dashed #c00;font-size:10pt;font-weight:700;color:#c00;letter-spacing:3px; }',
    '@media print { body{background:#fff;} .toolbar-print{display:none;} .page{box-shadow:none;margin:0;width:100%;} .label-grid{padding:10mm 4mm;} @page{size:A4 portrait;margin:0;} }'
  ].join('\n');

  const infoText = '前半(通常) ' + normal.length + '名　／　後半(催促) ' + arrears.length + '名　／　計 ' + active.length + '名';

  const html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>宛名ラベル</title>'
    + '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap" rel="stylesheet">'
    + '<style>' + css + '</style></head><body>'
    + '<div class="toolbar-print">'
    + '<button class="btn-print" onclick="window.print()">🖨 印刷する</button>'
    + '<button class="btn-close" onclick="window.close()">✕ 閉じる</button>'
    + '<span class="info">' + infoText + '</span>'
    + '</div>'
    + '<div class="page"><div class="label-grid">' + labelHtml + '</div></div>'
    + '</body></html>';

  const win = window.open('', '_blank', 'width=960,height=760');
  win.document.write(html);
  win.document.close();
}

loadAll();
