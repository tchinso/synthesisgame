import { materials } from './data/materials.js';
import { items } from './data/items.js';
import { stories } from './data/stories.js';
import { quests } from './data/quests.js';

const SAVE_KEY = 'synthesisgame-save-v1';
const GATHER_COST = 10;
const tabs = ['메인스토리', '퀘스트', '채집', '연금', '판매', '컨테이너', '세이브'];
const materialMap = Object.fromEntries(materials.map((material) => [material.name, material]));
const itemMap = Object.fromEntries(items.map((item) => [item.name, { ...item, ingredients: item.recipe.map(parseIngredient) }]));
const storyMap = Object.fromEntries(stories.map((story) => [story.id, story]));
const questMap = Object.fromEntries(quests.map((quest) => [quest.id, quest]));

const state = loadGame();
const ui = {
  tabMenu: document.querySelector('#tab-menu'),
  content: document.querySelector('#tab-content'),
  colDisplay: document.querySelector('#col-display'),
  progressSummary: document.querySelector('#progress-summary'),
  activeSummary: document.querySelector('#active-summary'),
  unlockFeed: document.querySelector('#unlock-feed'),
  logList: document.querySelector('#log-list'),
};

init();

function init() {
  ensureStoryUnlocked('0100', false);
  evaluateProgress();
  renderTabs();
  render();
}

function createDefaultState() {
  return {
    col: 120,
    inventory: { materials: {}, items: {} },
    discovered: { materials: {}, items: {} },
    stories: { unlocked: ['0100'], read: [], seenNew: [] },
    quests: { active: [], completed: [] },
    recipes: { unlocked: [] },
    logs: ['포포리와의 새 모험이 시작되었습니다.'],
    unlockFeed: ['메인스토리 0100이 열렸습니다.'],
    selectedTab: '메인스토리',
    storyViewer: { storyId: '0100', pageIndex: 0 },
  };
}

function loadGame() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return createDefaultState();
    return { ...createDefaultState(), ...JSON.parse(saved) };
  } catch {
    return createDefaultState();
  }
}

function saveGame(showLog = false) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  if (showLog) addLog('수동 저장을 완료했습니다.');
}

function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  Object.assign(state, createDefaultState());
  evaluateProgress();
  render();
}

function renderTabs() {
  ui.tabMenu.innerHTML = tabs
    .map((tab) => `<button class="tab-button ${state.selectedTab === tab ? 'active' : ''}" data-tab="${tab}">${tab}</button>`)
    .join('');
  ui.tabMenu.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedTab = button.dataset.tab;
      render();
    });
  });
}

function render() {
  renderTabs();
  ui.colDisplay.textContent = `${state.col} 콜`;
  ui.progressSummary.textContent = getProgressSummary();
  renderSidePanel();
  const renderers = {
    메인스토리: renderStoryTab,
    퀘스트: renderQuestTab,
    채집: renderGatherTab,
    연금: renderAlchemyTab,
    판매: renderSellTab,
    컨테이너: renderContainerTab,
    세이브: renderSaveTab,
  };
  ui.content.innerHTML = renderers[state.selectedTab]();
  bindCurrentTabEvents();
  saveGame();
}

function renderSidePanel() {
  const activeStory = getAvailableStories().find((story) => !state.stories.read.includes(story.id));
  const activeQuests = state.quests.active.map((id) => questMap[id]).filter(Boolean);
  ui.activeSummary.innerHTML = [
    `<li class="summary-item"><strong>메인스토리</strong><p>${activeStory ? `${activeStory.id} · ${activeStory.title}` : '새로 열린 메인스토리가 없습니다.'}</p></li>`,
    `<li class="summary-item"><strong>퀘스트</strong><p>${activeQuests.length ? activeQuests.slice(0, 3).map((quest) => `${quest.id} ${quest.name}`).join('<br />') : '진행 중인 퀘스트가 없습니다.'}</p></li>`,
  ].join('');
  ui.unlockFeed.innerHTML = state.unlockFeed.length
    ? state.unlockFeed.map((entry) => `<li>${entry}</li>`).join('')
    : '<li>아직 새로운 해금이 없습니다.</li>';
  ui.logList.innerHTML = state.logs.length ? state.logs.map((log) => `<li>${log}</li>`).join('') : '<li>아직 행동 로그가 없습니다.</li>';
}

function renderStoryTab() {
  const availableStories = getAvailableStories();
  const currentStoryId = state.storyViewer.storyId && availableStories.some((story) => story.id === state.storyViewer.storyId)
    ? state.storyViewer.storyId
    : availableStories[0]?.id;
  if (currentStoryId && currentStoryId !== state.storyViewer.storyId) {
    state.storyViewer = { storyId: currentStoryId, pageIndex: 0 };
  }
  const story = currentStoryId ? storyMap[currentStoryId] : null;
  if (!story) {
    return '<div class="empty-state">아직 읽을 수 있는 메인스토리가 없습니다.</div>';
  }
  const page = story.pages[state.storyViewer.pageIndex] ?? story.pages[0];
  return `
    <div class="section-grid">
      <div class="card">
        <h2 class="section-title">열린 메인스토리</h2>
        <div class="recipe-list">
          ${availableStories.map((entry) => {
            const isNew = !state.stories.seenNew.includes(entry.id) && !state.stories.read.includes(entry.id);
            return `<button class="ghost story-select" data-story-id="${entry.id}">
              <strong>${entry.id} · ${entry.title}</strong><br />
              <span>${state.stories.read.includes(entry.id) ? '다시보기 가능' : '진행 가능'} ${isNew ? '· NEW' : ''}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
      <div class="story-viewer">
        <div class="inline-actions">
          <span class="badge ${state.stories.read.includes(story.id) ? '' : 'new'}">${story.id}</span>
          <span class="badge">${story.title}</span>
          <span class="badge">페이지 ${state.storyViewer.pageIndex + 1} / ${story.pages.length}</span>
        </div>
        <div class="story-lines">${page.map((line) => `<div>${line}</div>`).join('')}</div>
        <div class="story-actions">
          <button class="ghost" data-action="story-prev" ${state.storyViewer.pageIndex === 0 ? 'disabled' : ''}>이전</button>
          <button data-action="story-next">${state.storyViewer.pageIndex === story.pages.length - 1 ? '읽기 완료' : '다음'}</button>
        </div>
      </div>
    </div>`;
}

function renderQuestTab() {
  const active = state.quests.active.map((id) => questMap[id]).filter(Boolean);
  const completed = state.quests.completed.map((id) => questMap[id]).filter(Boolean);
  const readyIds = getCompletableQuestIds();
  return `
    <div class="card-grid">
      ${active.map((quest) => {
        const owned = getOwnedCount(quest.objective.itemName);
        const ready = readyIds.includes(quest.id);
        return `<article class="card">
          <div class="inline-actions">
            <span class="badge">${quest.id}</span>
            ${ready ? '<span class="badge ready">완료 가능</span>' : '<span class="badge">진행 중</span>'}
          </div>
          <h3>${quest.name}</h3>
          <p>${quest.description}</p>
          <p><strong>목표:</strong> ${quest.objective.itemName} x${quest.objective.count}</p>
          <p><strong>보유:</strong> ${owned} / ${quest.objective.count}</p>
          <p><strong>보상:</strong> ${quest.rewards.col ?? 0} 콜</p>
          <div class="inline-actions">
            <button data-action="complete-quest" data-quest-id="${quest.id}" ${ready ? '' : 'disabled'}>${quest.category === 'delivery' ? '납품하고 완료' : '확인하고 완료'}</button>
          </div>
        </article>`;
      }).join('') || '<div class="empty-state">진행 중인 퀘스트가 없습니다.</div>'}
    </div>
    <div class="card" style="margin-top:16px;">
      <h3>완료한 퀘스트</h3>
      ${completed.length ? `<ul class="compact-list">${completed.map((quest) => `<li>${quest.id} · ${quest.name}</li>`).join('')}</ul>` : '<div class="empty-state">아직 완료한 퀘스트가 없습니다.</div>'}
    </div>`;
}

function renderGatherTab() {
  return `
    <div class="card">
      <h2 class="section-title">채집</h2>
      <p>숲과 들판을 탐색해 재료를 1개 얻습니다. 1회당 <strong>${GATHER_COST} 콜</strong>이 필요합니다.</p>
      <div class="inline-actions">
        <button data-action="gather" ${state.col < GATHER_COST ? 'disabled' : ''}>10 콜로 채집하기</button>
        <span class="badge">희귀 재료도 낮은 확률로 등장합니다.</span>
      </div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h3>대표 채집 재료</h3>
      <ul class="compact-list">
        ${materials.slice(0, 12).map((material) => `<li>${material.name} · ${(material.probability * 100).toFixed(1)}%</li>`).join('')}
      </ul>
    </div>`;
}

function renderAlchemyTab() {
  const unlockedRecipes = getUnlockedRecipes();
  return unlockedRecipes.length
    ? `<div class="recipe-list">${unlockedRecipes.map((recipe) => {
        const canCraft = recipe.ingredients.every((ingredient) => getOwnedCount(ingredient.name) >= ingredient.count);
        return `<article class="card">
          <div class="inline-actions">
            <span class="badge">${recipe.name}</span>
            <span class="badge">판매가 ${recipe.price} 콜</span>
          </div>
          <ul class="recipe-ingredients">${recipe.ingredients.map((ingredient) => `<li>${ingredient.name} x${ingredient.count} (보유 ${getOwnedCount(ingredient.name)})</li>`).join('')}</ul>
          <div class="inline-actions">
            <button data-action="craft" data-item-name="${recipe.name}" ${canCraft ? '' : 'disabled'}>1개 제작</button>
          </div>
        </article>`;
      }).join('')}</div>`
    : '<div class="empty-state">아직 해금된 연금 레시피가 없습니다. 필요한 재료를 한 번씩 모두 모아보세요.</div>';
}

function renderSellTab() {
  const materialsOwned = getOwnedEntries('materials');
  const itemsOwned = getOwnedEntries('items');
  return `
    <div class="section-grid">
      <section class="card">
        <h3>재료 판매</h3>
        ${materialsOwned.length ? materialsOwned.map(([name, count]) => `<div class="resource-row"><span>${name} x${count} · ${materialMap[name]?.price ?? 0} 콜</span><button class="ghost" data-action="sell" data-kind="materials" data-name="${name}">1개 판매</button></div>`).join('') : '<div class="empty-state">판매할 재료가 없습니다.</div>'}
      </section>
      <section class="card">
        <h3>조합 아이템 판매</h3>
        ${itemsOwned.length ? itemsOwned.map(([name, count]) => `<div class="resource-row"><span>${name} x${count} · ${itemMap[name]?.price ?? 0} 콜</span><button class="ghost" data-action="sell" data-kind="items" data-name="${name}">1개 판매</button></div>`).join('') : '<div class="empty-state">판매할 조합 아이템이 없습니다.</div>'}
      </section>
    </div>`;
}

function renderContainerTab() {
  const materialsOwned = getOwnedEntries('materials');
  const itemsOwned = getOwnedEntries('items');
  return `
    <div class="section-grid">
      <section class="card">
        <h3>재료 컨테이너</h3>
        ${materialsOwned.length ? `<ul class="inventory-list">${materialsOwned.map(([name, count]) => `<li>${name} x${count}${state.discovered.materials[name] ? ' · 획득한 적 있음' : ''}</li>`).join('')}</ul>` : '<div class="empty-state">보관 중인 재료가 없습니다.</div>'}
      </section>
      <section class="card">
        <h3>조합 아이템 컨테이너</h3>
        ${itemsOwned.length ? `<ul class="inventory-list">${itemsOwned.map(([name, count]) => `<li>${name} x${count}${state.discovered.items[name] ? ' · 제작/획득 경험 있음' : ''}</li>`).join('')}</ul>` : '<div class="empty-state">보관 중인 조합 아이템이 없습니다.</div>'}
      </section>
    </div>`;
}

function renderSaveTab() {
  return `
    <div class="card">
      <h2 class="section-title">세이브</h2>
      <p>이 게임은 자동 저장됩니다. 새로고침하거나 브라우저를 닫아도 현재 진행 상태가 유지됩니다.</p>
      <ul class="compact-list">
        <li>저장 항목: 콜, 인벤토리, 스토리 진행, 퀘스트 진행, 해금 레시피, 최근 로그</li>
        <li>최근 행동 로그는 최신 10개까지만 보관됩니다.</li>
      </ul>
      <div class="save-actions">
        <button data-action="manual-save">지금 저장</button>
        <button class="secondary" data-action="export-save">저장 데이터 내보내기</button>
        <button class="ghost" data-action="reset-save">저장 초기화</button>
      </div>
      <textarea id="export-box" rows="10" style="width:100%; margin-top:16px; border-radius:18px; border:1px solid var(--line); padding:12px;">${JSON.stringify(state, null, 2)}</textarea>
    </div>`;
}

function bindCurrentTabEvents() {
  ui.content.querySelectorAll('[data-story-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const storyId = button.dataset.storyId;
      state.storyViewer = { storyId, pageIndex: 0 };
      if (!state.stories.seenNew.includes(storyId)) state.stories.seenNew.push(storyId);
      render();
    });
  });
  ui.content.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => handleAction(button.dataset.action, button.dataset));
  });
}

function handleAction(action, dataset) {
  if (action === 'story-prev') {
    state.storyViewer.pageIndex = Math.max(0, state.storyViewer.pageIndex - 1);
  }
  if (action === 'story-next') {
    const story = storyMap[state.storyViewer.storyId];
    if (state.storyViewer.pageIndex < story.pages.length - 1) {
      state.storyViewer.pageIndex += 1;
    } else {
      completeStory(story.id);
    }
  }
  if (action === 'gather') gatherMaterial();
  if (action === 'craft') craftItem(dataset.itemName);
  if (action === 'sell') sellEntry(dataset.kind, dataset.name);
  if (action === 'complete-quest') completeQuest(dataset.questId);
  if (action === 'manual-save') saveGame(true);
  if (action === 'export-save') {
    const box = document.querySelector('#export-box');
    box?.select();
    navigator.clipboard?.writeText(box?.value ?? '');
    addLog('저장 데이터를 클립보드에 복사했습니다.');
  }
  if (action === 'reset-save') {
    if (window.confirm('저장 데이터를 초기화할까요? 현재 진행 상태가 모두 사라집니다.')) {
      resetGame();
      addLog('저장 데이터를 초기화했습니다.');
    }
  }
  evaluateProgress();
  render();
}

function gatherMaterial() {
  if (state.col < GATHER_COST) {
    addLog('콜이 부족해 채집할 수 없습니다.');
    return;
  }
  state.col -= GATHER_COST;
  const found = weightedPick(materials);
  adjustInventory('materials', found.name, 1);
  state.discovered.materials[found.name] = true;
  addLog(`채집 성공: ${found.name} x1`);
  unlockRecipes();
}

function craftItem(itemName) {
  const recipe = itemMap[itemName];
  if (!recipe) return;
  const missing = recipe.ingredients.find((ingredient) => getOwnedCount(ingredient.name) < ingredient.count);
  if (missing) {
    addLog(`제작 실패: ${missing.name} 재료가 부족합니다.`);
    return;
  }
  recipe.ingredients.forEach((ingredient) => consumeOwned(ingredient.name, ingredient.count));
  adjustInventory('items', itemName, 1);
  state.discovered.items[itemName] = true;
  if (!state.recipes.unlocked.includes(itemName)) state.recipes.unlocked.push(itemName);
  addLog(`연금 성공: ${itemName} x1 제작`);
  unlockRecipes();
}

function sellEntry(kind, name) {
  const price = kind === 'materials' ? materialMap[name]?.price : itemMap[name]?.price;
  if (!price || getOwnedCount(name) <= 0) return;
  adjustInventory(kind, name, -1);
  state.col += price;
  addLog(`판매 완료: ${name} x1 → ${price} 콜`);
}

function completeStory(storyId) {
  if (!state.stories.read.includes(storyId)) {
    state.stories.read.push(storyId);
    addLog(`메인스토리 ${storyId}을(를) 끝까지 읽었습니다.`);
    const story = storyMap[storyId];
    story.rewards?.unlockQuestIds?.forEach((questId) => unlockQuest(questId));
  }
  const story = storyMap[storyId];
  state.storyViewer = { storyId, pageIndex: story.pages.length - 1 };
}

function completeQuest(questId) {
  const quest = questMap[questId];
  if (!quest || !getCompletableQuestIds().includes(questId)) return;
  if (quest.category === 'delivery') {
    consumeOwned(quest.objective.itemName, quest.objective.count);
  }
  state.col += quest.rewards.col ?? 0;
  state.quests.active = state.quests.active.filter((id) => id !== questId);
  if (!state.quests.completed.includes(questId)) state.quests.completed.push(questId);
  addLog(`퀘스트 완료: ${quest.id} ${quest.name}`);
}

function evaluateProgress() {
  stories.forEach((story) => {
    if (canUnlockStory(story) && !state.stories.unlocked.includes(story.id)) {
      ensureStoryUnlocked(story.id, true);
    }
  });
  quests.forEach((quest) => {
    if (canUnlockQuest(quest) && !state.quests.active.includes(quest.id) && !state.quests.completed.includes(quest.id)) {
      unlockQuest(quest.id);
    }
  });
  unlockRecipes();
}

function ensureStoryUnlocked(storyId, announce = true) {
  if (!state.stories.unlocked.includes(storyId)) {
    state.stories.unlocked.push(storyId);
    if (announce) addUnlock(`메인스토리 ${storyId}이 열렸습니다.`);
  }
}

function unlockQuest(questId) {
  if (!state.quests.active.includes(questId) && !state.quests.completed.includes(questId)) {
    state.quests.active.push(questId);
    addUnlock(`퀘스트 ${questId}이 등록되었습니다.`);
  }
}

function unlockRecipes() {
  items.forEach((item) => {
    const parsed = itemMap[item.name];
    const isUnlocked = parsed.ingredients.every((ingredient) => state.discovered.materials[ingredient.name] || state.discovered.items[ingredient.name]);
    if (isUnlocked && !state.recipes.unlocked.includes(item.name)) {
      state.recipes.unlocked.push(item.name);
      addUnlock(`연금 레시피 해금: ${item.name}`);
    }
  });
}

function canUnlockStory(story) {
  return story.unlockConditions.every(checkCondition);
}
function canUnlockQuest(quest) {
  return quest.unlockConditions.every(checkCondition);
}
function checkCondition(condition) {
  if (condition.type === 'storyRead') return state.stories.read.includes(condition.storyId);
  if (condition.type === 'questClearAll') return condition.questIds.every((id) => state.quests.completed.includes(id));
  return true;
}

function getAvailableStories() {
  return state.stories.unlocked.map((id) => storyMap[id]).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}
function getCompletableQuestIds() {
  return state.quests.active.filter((id) => {
    const quest = questMap[id];
    if (!quest) return false;
    return getOwnedCount(quest.objective.itemName) >= quest.objective.count;
  });
}
function getUnlockedRecipes() {
  return state.recipes.unlocked.map((name) => itemMap[name]).filter(Boolean);
}
function getOwnedEntries(kind) {
  return Object.entries(state.inventory[kind]).filter(([, count]) => count > 0).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}
function getOwnedCount(name) {
  return (state.inventory.materials[name] ?? 0) + (state.inventory.items[name] ?? 0);
}
function adjustInventory(kind, name, amount) {
  state.inventory[kind][name] = Math.max(0, (state.inventory[kind][name] ?? 0) + amount);
}
function consumeOwned(name, amount) {
  const fromMaterials = Math.min(state.inventory.materials[name] ?? 0, amount);
  adjustInventory('materials', name, -fromMaterials);
  const rest = amount - fromMaterials;
  if (rest > 0) adjustInventory('items', name, -rest);
}
function addLog(message) {
  state.logs = [message, ...state.logs].slice(0, 10);
}
function addUnlock(message) {
  state.unlockFeed = [message, ...(state.unlockFeed ?? [])].slice(0, 10);
  addLog(message);
}
function getProgressSummary() {
  const unreadStory = getAvailableStories().find((story) => !state.stories.read.includes(story.id));
  if (unreadStory) return `${unreadStory.id} ${unreadStory.title}`;
  if (state.quests.active.length) return `${state.quests.active.length}개의 퀘스트 진행 중`;
  return '새로운 챕터를 기다리는 중';
}
function parseIngredient(raw) {
  const [name, count] = raw.split(' x');
  return { name, count: Number(count) };
}
function weightedPick(entries) {
  const roll = Math.random();
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.probability;
    if (roll <= cumulative) return entry;
  }
  return entries[entries.length - 1];
}
