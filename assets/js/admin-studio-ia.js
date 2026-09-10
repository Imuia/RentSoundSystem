(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STORAGE_KEY = 'rss_studio_ia_shure_v1';
  const APPROVED_KEY = 'rss_studio_ia_shure_approved_v1';

  const els = {
    campaignName: $('#studio-campaign-name'),
    tone: $('#studio-tone'),
    save: $('#studio-save-draft'),
    generate: $('#studio-generate'),
    generationStatus: $('#studio-generation-status span'),
    instagram: $('#studio-instagram-copy'),
    linkedinTitle: $('#studio-linkedin-title'),
    linkedin: $('#studio-linkedin-copy'),
    regenInstagram: $('#studio-regenerate-instagram'),
    regenLinkedin: $('#studio-regenerate-linkedin'),
    approveInstagram: $('#studio-approve-instagram'),
    approveLinkedin: $('#studio-approve-linkedin'),
    toast: $('#studio-toast')
  };

  let toastTimer = null;

  function toast(message, type = '') {
    if (!els.toast) return;
    els.toast.textContent = message;
    els.toast.className = `studio-toast show ${type}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.className = 'studio-toast';
    }, 3600);
  }

  function activeAudiences() {
    return $$('[data-audience].active').map(btn => btn.dataset.audience);
  }

  function activePlatforms() {
    return $$('[data-platform].active').map(btn => btn.dataset.platform);
  }

  function getState() {
    return {
      campaignName: els.campaignName?.value?.trim() || 'Excellence Sans Fil Shure',
      product: {
        name: 'Gamme Shure Axient Digital',
        description: 'Microphones HF Premium'
      },
      audiences: activeAudiences(),
      platforms: activePlatforms(),
      tone: els.tone?.value || 'Stabilité & Fiabilité Absolue',
      content: {
        instagram: els.instagram?.textContent?.trim() || '',
        linkedinTitle: els.linkedinTitle?.textContent?.trim() || '',
        linkedin: els.linkedin?.textContent?.trim() || ''
      },
      savedAt: new Date().toISOString()
    };
  }

  function saveState(silent = false) {
    const state = getState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!silent) toast('Brouillon sauvegardé sur cet appareil.');
    return state;
  }

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved) return;
      if (els.campaignName && saved.campaignName) els.campaignName.value = saved.campaignName;
      if (els.tone && saved.tone) els.tone.value = saved.tone;

      if (Array.isArray(saved.audiences)) {
        $$('[data-audience]').forEach(btn => {
          btn.classList.toggle('active', saved.audiences.includes(btn.dataset.audience));
          const icon = $('.material-symbols-outlined', btn);
          if (icon) icon.textContent = btn.classList.contains('active') ? 'check' : 'add';
        });
      }

      if (Array.isArray(saved.platforms)) {
        $$('[data-platform]').forEach(btn => btn.classList.toggle('active', saved.platforms.includes(btn.dataset.platform)));
      }

      if (saved.content?.instagram && els.instagram) els.instagram.textContent = saved.content.instagram;
      if (saved.content?.linkedinTitle && els.linkedinTitle) els.linkedinTitle.textContent = saved.content.linkedinTitle;
      if (saved.content?.linkedin && els.linkedin) els.linkedin.textContent = saved.content.linkedin;
    } catch (error) {
      console.warn('[Studio IA] Brouillon local illisible:', error);
    }

    try {
      const approved = JSON.parse(localStorage.getItem(APPROVED_KEY) || '{}');
      if (approved.instagram) markApproved('instagram', true);
      if (approved.linkedin) markApproved('linkedin', true);
    } catch (_) {}
  }

  function setBusy(button, busy, labelBusy = 'Génération…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent.trim();
      button.disabled = true;
      const span = $('span:last-child', button);
      if (span && button.id === 'studio-generate') span.textContent = labelBusy;
      else button.textContent = labelBusy;
    } else {
      button.disabled = false;
      const original = button.dataset.originalLabel;
      if (original) {
        if (button.id === 'studio-generate') {
          const span = $('span:last-child', button);
          if (span) span.textContent = original.replace(/^auto_awesome\s*/i, '').trim() || 'Générer contenus IA';
        } else {
          button.textContent = original;
        }
      }
      delete button.dataset.originalLabel;
    }
  }

  function fallbackContent(state, target = 'all') {
    const aud = state.audiences.length ? state.audiences.join(', ') : 'professionnels de l’événementiel';
    const tone = state.tone.toLowerCase();

    const instagram = `🎙️ ${state.campaignName}

Pour ${aud}, la fiabilité audio ne laisse aucune place au hasard. La gamme Shure Axient Digital accompagne les événements exigeants avec une liaison HF stable, une restitution précise et une mise en œuvre pensée pour les professionnels.

Disponible à la location chez RentSoundSystem.

#Shure #AxientDigital #LiveSound #EventPro #RentSoundSystem`;

    const linkedinTitle = 'Fiabilisez vos productions avec Shure Axient Digital.';
    const linkedin = `Pour les ${aud}, la continuité du signal et la qualité de captation sont essentielles.

Avec une approche ${tone}, RentSoundSystem met en avant la gamme Shure Axient Digital pour les productions live, corporate et événementielles qui exigent une solution HF professionnelle.

Préparez votre prochain événement avec un matériel dimensionné selon vos besoins et disponible à la location via RentSoundSystem.`;

    return { instagram, linkedin: { title: linkedinTitle, body: linkedin }, demo: true, target };
  }

  async function requestGeneration(target = 'all') {
    const state = getState();

    if (!state.audiences.length) {
      toast('Sélectionnez au moins une audience.', 'error');
      throw new Error('Audience manquante');
    }
    if (!state.platforms.length) {
      toast('Sélectionnez au moins une plateforme.', 'error');
      throw new Error('Plateforme manquante');
    }

    const adminClient = window.RSSAdmin?.getClient?.();
    if (!adminClient?.auth?.getSession) {
      throw new Error('Session Supabase administrateur indisponible.');
    }

    const { data: sessionData, error: sessionError } = await adminClient.auth.getSession();
    if (sessionError) throw sessionError;

    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new Error('Session administrateur expirée. Reconnectez-vous.');
    }

    const response = await fetch('/api/stripe/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        action: 'studio_ia_generate',
        campaignName: state.campaignName,
        product: state.product,
        audiences: state.audiences,
        platforms: state.platforms,
        tone: state.tone,
        target
      })
    });

    if (!response.ok) {
      let message = 'Génération IA indisponible.';
      try {
        const errorBody = await response.json();
        message = errorBody?.error || message;
      } catch (_) {}
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  function applyGenerated(data, target = 'all') {
    if ((target === 'all' || target === 'instagram') && data?.instagram && els.instagram) {
      els.instagram.textContent = data.instagram;
      markApproved('instagram', false);
    }
    if ((target === 'all' || target === 'linkedin') && data?.linkedin) {
      if (data.linkedin.title && els.linkedinTitle) els.linkedinTitle.textContent = data.linkedin.title;
      if (data.linkedin.body && els.linkedin) els.linkedin.textContent = data.linkedin.body;
      markApproved('linkedin', false);
    }
    if (els.generationStatus) {
      els.generationStatus.textContent = data?.demo ? 'Contenu de secours généré' : 'Généré à l’instant';
    }
    saveState(true);
  }

  async function generate(target = 'all', button = els.generate) {
    setBusy(button, true);
    if (els.generationStatus) els.generationStatus.textContent = 'Génération en cours…';

    try {
      const data = await requestGeneration(target);
      applyGenerated(data, target);
      toast('Contenu IA généré.');
    } catch (error) {
      // Graceful fallback keeps the page usable if the API key is not configured yet.
      const state = getState();
      const fallback = fallbackContent(state, target);
      applyGenerated(fallback, target);
      const detail = error?.message ? ` (${error.message})` : '';
      toast(`Mode de secours utilisé${detail}`, 'error');
    } finally {
      setBusy(button, false);
    }
  }

  function markApproved(platform, approved) {
    const button = platform === 'instagram' ? els.approveInstagram : els.approveLinkedin;
    if (!button) return;

    button.classList.toggle('approved', approved);
    button.textContent = approved ? 'Approuvé ✓' : 'Approuver';

    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(APPROVED_KEY) || '{}'); } catch (_) {}
    saved[platform] = approved ? {
      approvedAt: new Date().toISOString(),
      content: platform === 'instagram'
        ? { body: els.instagram?.textContent?.trim() || '' }
        : {
            title: els.linkedinTitle?.textContent?.trim() || '',
            body: els.linkedin?.textContent?.trim() || ''
          }
    } : null;
    localStorage.setItem(APPROVED_KEY, JSON.stringify(saved));
  }

  async function copyText(platform) {
    const text = platform === 'instagram'
      ? els.instagram?.textContent?.trim()
      : `${els.linkedinTitle?.textContent?.trim() || ''}\n\n${els.linkedin?.textContent?.trim() || ''}`.trim();

    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast(`${platform === 'instagram' ? 'Instagram' : 'LinkedIn'} copié.`);
    } catch (_) {
      toast('Copie automatique non disponible dans ce navigateur.', 'error');
    }
  }

  function toggleEdit(platform) {
    const targets = platform === 'instagram'
      ? [els.instagram]
      : [els.linkedinTitle, els.linkedin];

    const isEditing = targets.some(el => el?.isContentEditable);

    targets.forEach(el => {
      if (!el) return;
      el.contentEditable = String(!isEditing);
      el.classList.toggle('studio-editing', !isEditing);
    });

    if (isEditing) {
      saveState(true);
      toast('Modifications enregistrées dans le brouillon.');
    } else {
      targets[0]?.focus();
      toast('Mode édition activé. Cliquez de nouveau sur le crayon pour enregistrer.');
    }
  }

  $$('[data-audience]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const icon = $('.material-symbols-outlined', btn);
      if (icon) icon.textContent = btn.classList.contains('active') ? 'check' : 'add';
      saveState(true);
    });
  });

  $$('[data-platform]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      saveState(true);
    });
  });

  $$('[data-copy]').forEach(btn => btn.addEventListener('click', () => copyText(btn.dataset.copy)));
  $$('[data-edit]').forEach(btn => btn.addEventListener('click', () => toggleEdit(btn.dataset.edit)));

  els.save?.addEventListener('click', () => saveState(false));
  els.generate?.addEventListener('click', () => generate('all', els.generate));
  els.regenInstagram?.addEventListener('click', () => generate('instagram', els.regenInstagram));
  els.regenLinkedin?.addEventListener('click', () => generate('linkedin', els.regenLinkedin));

  els.approveInstagram?.addEventListener('click', () => {
    const next = !els.approveInstagram.classList.contains('approved');
    markApproved('instagram', next);
    toast(next ? 'Draft Instagram approuvé.' : 'Approbation Instagram retirée.');
  });

  els.approveLinkedin?.addEventListener('click', () => {
    const next = !els.approveLinkedin.classList.contains('approved');
    markApproved('linkedin', next);
    toast(next ? 'Draft LinkedIn approuvé.' : 'Approbation LinkedIn retirée.');
  });

  [els.campaignName, els.tone].forEach(el => {
    el?.addEventListener('change', () => saveState(true));
  });

  restoreState();
})();
