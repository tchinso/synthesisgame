import { materials } from './data/materials.js';
import { items } from './data/items.js';
import { stories } from './data/stories.js';
import { quests } from './data/quests.js';

const STORAGE_KEY = 'synthesisgame-save-v1';
const GATHER_COST = 10;
const MAX_LOGS = 10;

const materialMap = new Map(materials.map((material) => [material.name, material]));
const itemMap = new Map(items.map((item) => [item.name, item]));
const storyMap = new Map(stories.map((story) => [story.id, story]));
const questMap = new Map(quests.map((quest) => [quest.id, quest]));

const elements = {
  col: document.querySelector('#col-display'),
  storySummary: document.querySelector('#story-summary'),
  questSummary: document.querySelector('#quest-summary'),
  logList: document.querySelector('#log-list'),
  unlockList: document.querySelector('#unlock-list'),
  menuTabs: document.querySelector('#menu-tabs'),
  panels: Object.fromEntries(Array.from(document.querySelectorAll('.tab-panel')).map((panel) => [panel.id.replace('tab-', ''), panel])),
};

const defaultState = () => ({
  col: 120,
  inventory: { materials: {}, items: {} },
  obtained: { materials: [], items: [] },
  stories: { unlocked: ['0100'], read: [], seenNew: [] },
  storyProgress: {},
  quests: { active: [], completed: [] },
  recipes: { unlocked: [] },
  logs: ['게임을 시작했습니다. 첫 메인스토리 0100이 열렸습니다.'],
  unlocks: ['메인스토리 0100 해금'],
  activeStoryId: '0100',
  lastSavedAt: null,
});

let state = loadState();
bootstrapState();
render();

function bootstrapState() {
  syncStoryAvailability();
  syncQuestAvailability();
  syncRecipeUnlocks();
  autoSave(false);
}

function parseRecipeEntry(entry) {
  const [name, countText] = entry.split(' x');
  return { name, count: Number(countText) };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}

function saveState(showLog = true) {
  state.lastSavedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (showLog) addLog('수동 저장을 완료했습니다.');
  render();
}

function autoSave(showLog = false) {
  state.lastSavedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (showLog) addLog('자동 저장되었습니다.');
}

function addLog(message) {
  state.logs = [message, ...state.logs].slice(0, MAX_LOGS);
}

function addUnlock(message) {
  state.unlocks = [message, ...(state.unlocks || [])].slice(0, MAX_LOGS);
}

function getCount(name) {
  if (materialMap.has(name)) return state.inventory.materials[name] || 0;
  return state.inventory.items[name] || 0;
}

function setCount(name, value) {
  const bucket = materialMap.has(name) ? state.inventory.materials : state.inventory.items;
  if (value <= 0) delete bucket[name];
  else bucket[name] = value;
}

function incrementItem(name, amount = 1) {
  setCount(name, getCount(name) + amount);
  const obtainedBucket = materialMap.has(name) ? state.obtained.materials : state.obtained.items;
  if (!obtainedBucket.includes(name)) obtainedBucket.push(name);
}

function consumeItem(name, amount) {
  const current = getCount(name);
  if (current < amount) return false;
  setCount(name, current - amount);
  return true;
}

function conditionsMet(conditions = []) {
  return conditions.every((condition) => {
    switch (condition.type) {
      case 'storyRead':
        return state.stories.read.includes(condition.storyId);
      case 'questClearAll':
        return condition.questIds.every((id) => state.quests.completed.includes(id));
      default:
        return true;
    }
  });
}

function syncStoryAvailability() {
  for (const story of stories) {
    if (!state.stories.unlocked.includes(story.id) && conditionsMet(story.unlockConditions)) {
      state.stories.unlocked.push(story.id);
      addUnlock(`메인스토리 ${story.id} ${story.title} 해금`);
      addLog(`메인스토리 ${story.id}이(가) 새로 열렸습니다.`);
      state.activeStoryId = story.id;
    }
  }
}

function syncQuestAvailability() {
  for (const quest of quests) {
    const alreadyKnown = state.quests.active.includes(quest.id) || state.quests.completed.includes(quest.id);
    if (!alreadyKnown && conditionsMet(quest.unlockConditions)) {
      state.quests.active.push(quest.id);
      addUnlock(`퀘스트 ${quest.id} ${quest.name} 등록`);
      addLog(`퀘스트 ${quest.id} ${quest.name}이(가) 등록되었습니다.`);
    }
  }
}

function syncRecipeUnlocks() {
  for (const item of items) {
    if (state.recipes.unlocked.includes(item.name)) continue;
    const hasSeenAllIngredients = item.recipe.every((entry) => {
      const { name } = parseRecipeEntry(entry);
      return materialMap.has(name) ? state.obtained.materials.includes(name) : state.obtained.items.includes(name);
    });
    if (hasSeenAllIngredients) {
      state.recipes.unlocked.push(item.name);
      addUnlock(`연금 레시피 ${item.name} 해금`);
      addLog(`새 연금 레시피 ${item.name}을(를) 발견했습니다.`);
    }
  }
}

function applyStoryRewards(story) {
  const rewardQuestIds = story.rewards?.unlockQuestIds || [];
  for (const questId of rewardQuestIds) {
    if (!state.quests.active.includes(questId) && !state.quests.completed.includes(questId)) {
      state.quests.active.push(questId);
      const quest = questMap.get(questId);
      addUnlock(`퀘스트 ${questId} ${quest?.name || ''} 등록`.trim());
    }
  }
}

function markStoryRead(storyId) {
  if (!state.stories.read.includes(storyId)) {
    state.stories.read.push(storyId);
    const story = storyMap.get(storyId);
    addLog(`메인스토리 ${storyId} ${story.title}을(를) 끝까지 읽었습니다.`);
    applyStoryRewards(story);
    syncQuestAvailability();
    syncStoryAvailability();
  }
}

function gatherOnce() {
  if (state.col < GATHER_COST) return;
  state.col -= GATHER_COST;
  const roll = Math.random();
  let cumulative = 0;
  let result = materials[materials.length - 1];
  for (const material of materials) {
    cumulative += material.probability;
    if (roll <= cumulative) {
      result = material;
      break;
    }
  }
  incrementItem(result.name, 1);
  addLog(`채집 성공: ${result.name} x1 획득 (-${GATHER_COST}콜)`);
  syncRecipeUnlocks();
  syncQuestAvailability();
  autoSave();
  render();
}

function craftItem(name) {
  const item = itemMap.get(name);
  if (!item) return;
  const requirements = item.recipe.map(parseRecipeEntry);
  const missing = requirements.filter((requirement) => getCount(requirement.name) < requirement.count);
  if (missing.length > 0) {
    addLog(`제작 실패: ${name} 재료 부족 (${missing.map((entry) => `${entry.name} ${entry.count - getCount(entry.name)}개 부족`).join(', ')})`);
    render();
    return;
  }
  requirements.forEach((requirement) => consumeItem(requirement.name, requirement.count));
  incrementItem(name, 1);
  addLog(`연금 성공: ${name} x1 제작 완료`);
  syncRecipeUnlocks();
  autoSave();
  render();
}

function sellItem(name) {
  const count = getCount(name);
  if (count <= 0) return;
  const price = materialMap.get(name)?.price ?? itemMap.get(name)?.price ?? 0;
  consumeItem(name, 1);
  state.col += price;
  addLog(`판매 완료: ${name} x1 판매 (+${price}콜)`);
  autoSave();
  render();
}

function completeQuest(id) {
  const quest = questMap.get(id);
  if (!quest) return;
  const { itemName, count } = quest.objective;
  if (getCount(itemName) < count) return;
  consumeItem(itemName, count);
  state.quests.active = state.quests.active.filter((questId) => questId !== id);
  if (!state.quests.completed.includes(id)) state.quests.completed.push(id);
  state.col += quest.rewards?.col || 0;
  addLog(`퀘스트 완료: ${quest.id} ${quest.name} (+${quest.rewards?.col || 0}콜)`);
  if (quest.rewards?.unlockStoryIds) {
    quest.rewards.unlockStoryIds.forEach((storyId) => {
      if (!state.stories.unlocked.includes(storyId)) state.stories.unlocked.push(storyId);
    });
  }
  syncStoryAvailability();
  syncQuestAvailability();
  autoSave();
  render();
}

function openStory(storyId) {
  state.activeStoryId = storyId;
  state.storyProgress[storyId] = 0;
  render();
}

function nextStoryPage(storyId) {
  const story = storyMap.get(storyId);
  const current = state.storyProgress[storyId] || 0;
  if (current < story.pages.length - 1) {
    state.storyProgress[storyId] = current + 1;
  } else {
    markStoryRead(storyId);
  }
  autoSave();
  render();
}

function resetSave() {
  if (!window.confirm('정말로 저장 데이터를 초기화할까요? 모든 진행 상황이 사라집니다.')) return;
  state = defaultState();
  bootstrapState();
  addLog('저장 데이터를 초기화했습니다.');
  autoSave();
  render();
}

function formatLastSaved() {
  if (!state.lastSavedAt) return '아직 저장 기록이 없습니다.';
  return new Date(state.lastSavedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });
}

function render() {
  elements.col.textContent = `${state.col.toLocaleString()} 콜`;
  const currentStory = stories.find((story) => state.stories.unlocked.includes(story.id) && !state.stories.read.includes(story.id)) || storyMap.get(state.activeStoryId);
  elements.storySummary.textContent = currentStory ? `${currentStory.id} ${currentStory.title}` : '없음';
  elements.questSummary.textContent = `${state.quests.active.length}개`;
  renderTabs();
  renderStoryTab();
  renderQuestTab();
  renderGatherTab();
  renderAlchemyTab();
  renderSellTab();
  renderContainerTab();
  renderSaveTab();
  elements.logList.innerHTML = state.logs.map((log) => `<li>${log}</li>`).join('');
  elements.unlockList.innerHTML = (state.unlocks || []).map((entry) => `<li>${entry}</li>`).join('') || '<li>아직 새로운 해금이 없습니다.</li>';
}

function renderTabs() {
  elements.menuTabs.querySelectorAll('button').forEach((button) => {
    button.onclick = () => {
      const target = button.dataset.tab;
      elements.menuTabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      Object.entries(elements.panels).forEach(([key, panel]) => panel.classList.toggle('active', key === target));
    };
  });
}

function renderStoryTab() {
  const availableStories = stories.filter((story) => state.stories.unlocked.includes(story.id));
  const activeStory = storyMap.get(state.activeStoryId) || availableStories[0];
  const pageIndex = state.storyProgress[activeStory?.id] || 0;
  const currentPage = activeStory?.pages[pageIndex] || ['읽을 수 있는 스토리가 없습니다.'];

  elements.panels.story.innerHTML = `
    <div class="section-stack">
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>메인스토리</h2>
            <p class="small-copy">비주얼 노벨처럼 3~4줄씩 읽고 다음 버튼으로 진행하세요.</p>
          </div>
        </div>
        <div class="story-layout">
          <div class="story-list">
            ${availableStories.map((story) => `
              <button class="story-button ${story.id === activeStory?.id ? 'active' : ''}" data-story-id="${story.id}">
                <div class="card-header">
                  <h3>${story.id} ${story.title}</h3>
                  ${state.stories.read.includes(story.id) ? '<span class="story-badge">읽음</span>' : '<span class="story-badge">NEW</span>'}
                </div>
                <div class="muted">${state.stories.read.includes(story.id) ? '다시보기 가능' : '읽기 진행 중'}</div>
              </button>
            `).join('') || '<div class="empty-state">아직 해금된 메인스토리가 없습니다.</div>'}
          </div>
          <div class="story-reader">
            <div>
              <div class="card-header">
                <h3>${activeStory ? `${activeStory.id} ${activeStory.title}` : '스토리 없음'}</h3>
                <span class="meta-pill">${activeStory ? `${pageIndex + 1} / ${activeStory.pages.length} 페이지` : ''}</span>
              </div>
              <div class="vn-page">${currentPage.join('\n')}</div>
            </div>
            ${activeStory ? `<div class="reader-actions">
              <button class="secondary-btn" id="story-restart">처음부터 읽기</button>
              <button class="primary-btn" id="story-next">${pageIndex < activeStory.pages.length - 1 ? '다음' : '읽기 완료'}</button>
            </div>` : ''}
          </div>
        </div>
      </section>
    </div>
  `;

  elements.panels.story.querySelectorAll('[data-story-id]').forEach((button) => {
    button.onclick = () => openStory(button.dataset.storyId);
  });
  if (activeStory) {
    elements.panels.story.querySelector('#story-next').onclick = () => nextStoryPage(activeStory.id);
    elements.panels.story.querySelector('#story-restart').onclick = () => {
      state.storyProgress[activeStory.id] = 0;
      render();
    };
  }
}

function renderQuestTab() {
  const activeQuests = state.quests.active.map((id) => questMap.get(id)).filter(Boolean);
  const completedQuests = state.quests.completed.map((id) => questMap.get(id)).filter(Boolean);
  elements.panels.quests.innerHTML = `
    <div class="section-stack">
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>진행 중 퀘스트</h2>
            <p class="small-copy">목표 수량을 갖췄다면 즉시 납품할 수 있습니다.</p>
          </div>
          <span class="meta-pill">${activeQuests.length}개</span>
        </div>
        <div class="quest-grid">
          ${activeQuests.map((quest) => {
            const owned = getCount(quest.objective.itemName);
            const canComplete = owned >= quest.objective.count;
            return `
              <article class="quest-card">
                <div class="card-header">
                  <h3>${quest.id} ${quest.name}</h3>
                  <span class="meta-pill ${canComplete ? 'success' : 'warning'}">${canComplete ? '완료 가능' : '진행 중'}</span>
                </div>
                <p>${quest.description}</p>
                <div class="quest-meta">
                  <span class="meta-pill">목표: ${quest.objective.itemName} x${quest.objective.count}</span>
                  <span class="meta-pill">보유: ${owned}개</span>
                  <span class="meta-pill">보상: ${quest.rewards.col}콜</span>
                </div>
                <div class="inline-actions">
                  <button class="primary-btn" data-complete-quest="${quest.id}" ${canComplete ? '' : 'disabled'}>납품하고 완료</button>
                </div>
              </article>
            `;
          }).join('') || '<div class="empty-state">진행 중인 퀘스트가 없습니다.</div>'}
        </div>
      </section>
      <section class="section-card">
        <div class="section-header">
          <h2>완료한 퀘스트</h2>
          <span class="meta-pill success">${completedQuests.length}개</span>
        </div>
        <ul class="plain-list">
          ${completedQuests.map((quest) => `<li>${quest.id} ${quest.name}</li>`).join('') || '<li>아직 완료한 퀘스트가 없습니다.</li>'}
        </ul>
      </section>
    </div>
  `;
  elements.panels.quests.querySelectorAll('[data-complete-quest]').forEach((button) => {
    button.onclick = () => completeQuest(button.dataset.completeQuest);
  });
}

function renderGatherTab() {
  elements.panels.gather.innerHTML = `
    <div class="section-stack">
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>채집</h2>
            <p class="small-copy">1회 채집마다 10콜을 소모하고, 확률에 따라 재료 1개를 획득합니다.</p>
          </div>
          <span class="cost-tag">소모: ${GATHER_COST}콜</span>
        </div>
        <div class="inline-actions">
          <button class="primary-btn" id="gather-btn" ${state.col >= GATHER_COST ? '' : 'disabled'}>채집하기</button>
          <span class="muted">콜이 부족하면 채집할 수 없습니다.</span>
        </div>
      </section>
      <section class="section-card">
        <div class="section-header"><h2>채집 확률표</h2></div>
        <div class="item-grid">
          ${materials.map((material) => `
            <article class="item-card">
              <div class="card-header"><h3>${material.name}</h3><span class="meta-pill">${(material.probability * 100).toFixed(1)}%</span></div>
              <div class="muted">판매가 ${material.price}콜</div>
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;
  elements.panels.gather.querySelector('#gather-btn').onclick = gatherOnce;
}

function renderAlchemyTab() {
  const unlockedRecipes = items.filter((item) => state.recipes.unlocked.includes(item.name));
  elements.panels.alchemy.innerHTML = `
    <div class="section-stack">
      <section class="section-card">
        <div class="section-header">
          <div>
            <h2>연금</h2>
            <p class="small-copy">하위 재료를 모두 한 번 이상 입수한 레시피만 표시되며, 해금 후에는 계속 남습니다.</p>
          </div>
          <span class="meta-pill">해금된 레시피 ${unlockedRecipes.length}개</span>
        </div>
        <div class="item-grid">
          ${unlockedRecipes.map((item) => {
            const requirements = item.recipe.map(parseRecipeEntry);
            const craftable = requirements.every((requirement) => getCount(requirement.name) >= requirement.count);
            return `
              <article class="item-card">
                <div class="card-header">
                  <h3>${item.name}</h3>
                  <span class="meta-pill">판매가 ${item.price}콜</span>
                </div>
                <p class="muted">${item.recipe.join(' / ')}</p>
                <div class="inline-actions">
                  <button class="primary-btn" data-craft-item="${item.name}" ${craftable ? '' : 'disabled'}>1개 제작</button>
                  <span class="muted">${craftable ? '지금 제작 가능' : '재료 부족'}</span>
                </div>
              </article>
            `;
          }).join('') || '<div class="empty-state">아직 해금된 레시피가 없습니다. 다양한 재료와 중간 제작물을 한 번씩 모아 보세요.</div>'}
        </div>
      </section>
    </div>
  `;
  elements.panels.alchemy.querySelectorAll('[data-craft-item]').forEach((button) => {
    button.onclick = () => craftItem(button.dataset.craftItem);
  });
}

function renderSellTab() {
  const ownedMaterials = materials.filter((material) => getCount(material.name) > 0);
  const ownedItems = items.filter((item) => getCount(item.name) > 0);
  const renderSellSection = (title, list, isMaterial) => `
    <section class="section-card">
      <div class="section-header"><h2>${title}</h2><span class="meta-pill">${list.length}종</span></div>
      <div class="item-grid">
        ${list.map((entry) => `
          <article class="item-card">
            <div class="card-header">
              <h3>${entry.name}</h3>
              <span class="meta-pill">보유 ${getCount(entry.name)}개</span>
            </div>
            <div class="inline-actions">
              <span class="muted">판매가 ${isMaterial ? entry.price : entry.price}콜</span>
              <button class="primary-btn" data-sell-item="${entry.name}">1개 판매</button>
            </div>
          </article>
        `).join('') || '<div class="empty-state">판매할 수 있는 아이템이 없습니다.</div>'}
      </div>
    </section>
  `;
  elements.panels.sell.innerHTML = `<div class="section-stack">${renderSellSection('재료 판매', ownedMaterials, true)}${renderSellSection('조합 아이템 판매', ownedItems, false)}</div>`;
  elements.panels.sell.querySelectorAll('[data-sell-item]').forEach((button) => {
    button.onclick = () => sellItem(button.dataset.sellItem);
  });
}

function renderContainerTab() {
  const ownedMaterials = materials.filter((material) => getCount(material.name) > 0);
  const ownedItems = items.filter((item) => getCount(item.name) > 0);
  const renderInventoryCards = (title, list) => `
    <section class="section-card">
      <div class="section-header"><h2>${title}</h2><span class="meta-pill">${list.length}종</span></div>
      <div class="inventory-grid">
        ${list.map((entry) => `<article class="item-card"><div class="card-header"><h3>${entry.name}</h3><span class="meta-pill">x${getCount(entry.name)}</span></div></article>`).join('') || '<div class="empty-state">아직 보유한 항목이 없습니다.</div>'}
      </div>
    </section>
  `;
  elements.panels.container.innerHTML = `<div class="section-stack">${renderInventoryCards('재료', ownedMaterials)}${renderInventoryCards('조합 아이템', ownedItems)}</div>`;
}

function renderSaveTab() {
  elements.panels.save.innerHTML = `
    <div class="section-stack">
      <section class="save-card">
        <div class="section-header">
          <div>
            <h2>세이브</h2>
            <p class="small-copy">브라우저를 닫거나 새로고침해도 자동 저장됩니다. 필요하면 수동 저장이나 초기화를 실행하세요.</p>
          </div>
        </div>
        <div class="save-grid">
          <div class="item-card">
            <div class="card-header"><h3>저장 상태</h3></div>
            <p class="muted">마지막 저장 시각: ${formatLastSaved()}</p>
          </div>
          <div class="inline-actions">
            <button class="primary-btn" id="manual-save">지금 저장</button>
            <button class="danger-btn" id="reset-save">저장 초기화</button>
          </div>
        </div>
      </section>
    </div>
  `;
  elements.panels.save.querySelector('#manual-save').onclick = () => saveState(true);
  elements.panels.save.querySelector('#reset-save').onclick = resetSave;
}
