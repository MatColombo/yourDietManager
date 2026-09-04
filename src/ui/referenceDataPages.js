import { element } from './dom.js';
import { taxonomyChoices, createAutocomplete, createTokenChips, localizedTermLabel } from './guidedControls.js';
import { saveUserTaxonomyTerm } from '../services/referenceDataEditorService.js';

function t(state, key) { return state.i18n.t(key); }
function nav(state, href) { return state.navigate(href); }
function page(state) {
  return element('section', { className: 'page-card page-card--wide config-page' }, [
    element('p', { className: 'eyebrow', text: 'REFERENCE DATA' }),
    element('h1', { text: t(state, 'reference.page.title') }),
    element('p', { className: 'lead', text: t(state, 'reference.page.body') })
  ]);
}
function field(label, control, hint = '') { return element('label', { className: 'field' }, [element('span', { text: label }), control, hint ? element('small', { className: 'field__hint', text: hint }) : null]); }
function taxonomyLabel(state, taxonomy) { return taxonomy?.i18n?.[state.i18n.locale]?.label || taxonomy?.i18n?.en?.label || taxonomy?.taxonomyId || '—'; }
function termLabel(state, term) { return term?.i18n?.[state.i18n.locale]?.label || term?.i18n?.en?.label || term?.termId || '—'; }

function termEditor(state, taxonomy, existing = null) {
  const box = element('div', { className: 'reference-term-editor editor-stack' });
  const status = element('div', { 'aria-live': 'polite' });
  const it = element('input', { type: 'text', value: existing?.i18n?.it?.label || '', required: '' });
  const en = element('input', { type: 'text', value: existing?.i18n?.en?.label || '', required: '' });
  const descIt = element('input', { type: 'text', value: existing?.i18n?.it?.description || '' });
  const descEn = element('input', { type: 'text', value: existing?.i18n?.en?.description || '' });
  const aliasesIt = createTokenChips({ values: existing?.aliases?.it || [], placeholder: t(state, 'reference.alias.placeholder'), addLabel: t(state, 'common.add') });
  const aliasesEn = createTokenChips({ values: existing?.aliases?.en || [], placeholder: t(state, 'reference.alias.placeholder'), addLabel: t(state, 'common.add') });
  let parentControl = null;
  if (taxonomy.hierarchical) {
    parentControl = createAutocomplete({
      choices: taxonomyChoices(state.referenceDataIndex, taxonomy.taxonomyId, state.i18n.locale, { rootsOnly: true }).filter(choice => choice.id !== existing?.termId),
      value: existing?.parentTermId || null,
      required: false,
      placeholder: t(state, 'reference.parent.placeholder')
    });
  }

  box.append(element('div', { className: 'form-grid form-grid--2' }, [
    field(t(state, 'reference.label.it'), it), field(t(state, 'reference.label.en'), en),
    field(t(state, 'reference.description.it'), descIt), field(t(state, 'reference.description.en'), descEn)
  ]));
  if (parentControl) {
    const parentField = field(t(state, 'reference.parent'), parentControl.node, existing ? t(state, 'reference.parent.fixed') : t(state, 'reference.parent.help'));
    if (existing) parentControl.input.disabled = true;
    box.append(parentField);
  }
  box.append(field(t(state, 'reference.aliases.it'), aliasesIt.node), field(t(state, 'reference.aliases.en'), aliasesEn.node));

  const save = element('button', { type: 'button', className: 'button', text: t(state, 'common.save') });
  save.addEventListener('click', async () => {
    status.textContent = ''; status.className = '';
    if (!it.value.trim() || !en.value.trim()) {
      status.className = 'validation-box validation-box--error'; status.textContent = t(state, 'reference.validation.labels'); return;
    }
    try {
      save.disabled = true;
      const term = await saveUserTaxonomyTerm({
        termId: existing?.termId || null,
        taxonomyId: taxonomy.taxonomyId,
        parentTermId: existing?.parentTermId ?? parentControl?.getValue?.() ?? null,
        labelIt: it.value, labelEn: en.value, descriptionIt: descIt.value, descriptionEn: descEn.value,
        aliasesIt: aliasesIt.getValues(), aliasesEn: aliasesEn.getValues()
      }, { repo: state.repo, registry: state.registry });
      await state.refreshReferenceData();
      state.notice = t(state, existing ? 'reference.saved' : 'reference.created');
      state.markSaved?.(); state.notify?.('success', state.notice);
      nav(state, `/configure/reference-data?taxonomy=${encodeURIComponent(taxonomy.taxonomyId)}&term=${encodeURIComponent(term.termId)}`);
    } catch (error) {
      status.className = 'validation-box validation-box--error'; status.textContent = error.message || String(error); save.disabled = false;
    }
  });
  box.append(status, element('div', { className: 'button-row' }, [element('a', { href: `/configure/reference-data?taxonomy=${encodeURIComponent(taxonomy.taxonomyId)}`, 'data-route': '', className: 'button button--secondary', text: t(state, 'common.cancel') }), save]));
  return box;
}

export function referenceDataPage(state) {
  const section = page(state);
  const params = new URLSearchParams(location.search);
  const taxonomies = [...(state.referenceTaxonomies || [])].filter(item => item.status === 'active').sort((a, b) => taxonomyLabel(state, a).localeCompare(taxonomyLabel(state, b), state.i18n.locale));
  const activeTaxonomyId = params.get('taxonomy') || taxonomies[0]?.taxonomyId || '';
  const taxonomy = taxonomies.find(item => item.taxonomyId === activeTaxonomyId) || taxonomies[0];
  if (!taxonomy) { section.append(element('div', { className: 'empty-state', text: t(state, 'reference.empty') })); return section; }

  const taxonomySelect = element('select');
  for (const item of taxonomies) taxonomySelect.append(element('option', { value: item.taxonomyId, text: taxonomyLabel(state, item) }));
  taxonomySelect.value = taxonomy.taxonomyId;
  taxonomySelect.addEventListener('change', () => nav(state, `/configure/reference-data?taxonomy=${encodeURIComponent(taxonomySelect.value)}`));
  section.append(field(t(state, 'reference.taxonomy'), taxonomySelect, t(state, taxonomy.hierarchical ? 'reference.taxonomy.hierarchical' : 'reference.taxonomy.flat')));

  const editId = params.get('edit');
  const editTerm = editId ? state.referenceDataIndex.term(editId) : null;
  if (editId) {
    if (!editTerm || editTerm.taxonomyId !== taxonomy.taxonomyId || editTerm.origin !== 'user') section.append(element('div', { className: 'validation-box validation-box--error', text: t(state, 'reference.edit.invalid') }));
    else section.append(termEditor(state, taxonomy, editTerm));
    return section;
  }
  if (params.get('new') === '1') { section.append(termEditor(state, taxonomy)); return section; }

  const toolbar = element('div', { className: 'page-actions' });
  if ((taxonomy.extensibleBy || []).includes('user')) toolbar.append(element('a', { href: `/configure/reference-data?taxonomy=${encodeURIComponent(taxonomy.taxonomyId)}&new=1`, 'data-route': '', className: 'button', text: t(state, 'reference.term.add') }));
  const search = element('input', { type: 'search', placeholder: t(state, 'reference.search') });
  toolbar.append(search); section.append(toolbar);
  if (state.notice) section.append(element('div', { className: 'validation-box', text: state.notice }));

  const list = element('div', { className: 'reference-term-list' }); section.append(list);
  const render = () => {
    const query = search.value.trim().toLowerCase(); list.replaceChildren();
    const all = (state.referenceTerms || []).filter(term => term.taxonomyId === taxonomy.taxonomyId && term.status === 'active');
    const roots = all.filter(term => !term.parentTermId).sort((a, b) => termLabel(state, a).localeCompare(termLabel(state, b), state.i18n.locale));
    const visible = term => !query || [termLabel(state, term), term.termId, ...(term.aliases?.it || []), ...(term.aliases?.en || [])].join(' ').toLowerCase().includes(query);
    const appendTerm = (term, depth = 0) => {
      const children = all.filter(child => child.parentTermId === term.termId).sort((a, b) => termLabel(state, a).localeCompare(termLabel(state, b), state.i18n.locale));
      if (!visible(term) && !children.some(visible)) return;
      const row = element('article', { className: `reference-term-card${depth ? ' reference-term-card--child' : ''}` });
      row.append(element('div', {}, [element('strong', { text: termLabel(state, term) }), element('p', { className: 'muted', text: term.i18n?.[state.i18n.locale]?.description || term.i18n?.en?.description || term.termId })]));
      const meta = element('div', { className: 'reference-term-meta' }, [element('span', { className: `origin-pill origin-pill--${term.origin}`, text: t(state, `catalog.origin.${term.origin}`) })]);
      if (term.parentTermId) meta.append(element('span', { className: 'muted', text: `${t(state, 'reference.parent')}: ${localizedTermLabel(state.referenceDataIndex, term.parentTermId, state.i18n.locale)}` }));
      if (term.provenance?.sourceLabel) meta.append(element('span', { className: 'muted', text: `${t(state, 'reference.provenance')}: ${term.provenance.sourceLabel}` }));
      if (term.origin === 'user') meta.append(element('a', { href: `/configure/reference-data?taxonomy=${encodeURIComponent(taxonomy.taxonomyId)}&edit=${encodeURIComponent(term.termId)}`, 'data-route': '', className: 'button button--secondary button--small', text: t(state, 'common.edit') }));
      row.append(meta); list.append(row);
      for (const child of children) appendTerm(child, depth + 1);
    };
    for (const root of roots) appendTerm(root);
    if (!list.children.length) list.append(element('div', { className: 'empty-state', text: t(state, 'reference.noResults') }));
  };
  search.addEventListener('input', render); render();
  return section;
}
