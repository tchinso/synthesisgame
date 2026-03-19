import { materials } from '../data/materials.js';
import { items } from '../data/items.js';
import { stories } from '../data/stories.js';
import { quests } from '../data/quests.js';

const STORAGE_KEY = 'synthesisgame-save-v1';
const GATHER_COST = 10;
const GATHER_TEN_COST = 100;
const LOG_LIMIT = 10;
const MENU = ['메인스토리', '퀘스트', '채집', '연금', '판매', '컨테이너', '세이브'];

const itemMap = new Map(items.map((item) => [item.name, item]));
const materialNames = new Set(materials.map((material) => material.name));
const questMap = new Map(quests.map((quest) => [quest.id, quest]));
const storyMap = new Map(stories.map((story) => [story.id, story]));
const allRecipes = items.map((item) => item.name);

const parseRecipeEntry = (entry) => {
  const [name, countText] = entry.split(' x');
  return { name, count: Number(countText) };
};

const getInitialState = () => ({
  col: 500,
  inventory: { materials: {}, items: {} },
  seen: { materials: [], items: [] },
  stories: { unlocked: ['0100'], read: [], activeId: '0100', pageIndex: 0, newIds: ['0100'] },
  quests: { active: [], completed: [] },
  recipes: { unlocked: [] },
  crafted: [],
  logs: ['게임을 시작했습니다. 메인스토리 0100이 열렸습니다.'],
  manualSaveAt: null,
});

let state = getInitialState();
let currentTab = '메인스토리';

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const fresh = getInitialState();
    hydrateProgress(fresh, { initial: true });
    return fresh;
  }

  try {
    const parsed = JSON.parse(saved);
    const merged = { ...getInitialState(), ...parsed };
    merged.inventory = { ...getInitialState().inventory, ...(parsed.inventory || {}) };
    merged.seen = { ...getInitialState().seen, ...(parsed.seen || {}) };
    merged.stories = { ...getInitialState().stories, ...(parsed.stories || {}) };
    merged.quests = { ...getInitialState().quests, ...(parsed.quests || {}) };
    merged.recipes = { ...getInitialState().recipes, ...(parsed.recipes || {}) };
    merged.logs = Array.isArray(parsed.logs) ? parsed.logs.slice(0, LOG_LIMIT) : getInitialState().logs;
    hydrateProgress(merged, { initial: true });
    return merged;
  } catch (error) {
    console.error(error);
    const fresh = getInitialState();
    hydrateProgress(fresh, { initial: true });
    return fresh;
  }
}

function saveState(logMessage) {
  state.logs = state.logs.slice(0, LOG_LIMIT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (logMessage) {
    addLog(logMessage, { saveAfter: false });
  }
}

function addLog(message, options = {}) {
  state.logs = [message, ...state.logs].slice(0, LOG_LIMIT);
  if (options.saveAfter !== false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function getCount(name) {
  return materialNames.has(name)
    ? (state.inventory.materials[name] || 0)
    : (state.inventory.items[name] || 0);
}

function setCount(name, value) {
  const bucket = materialNames.has(name) ? state.inventory.materials : state.inventory.items;
  if (value <= 0) {
    delete bucket[name];
  } else {
    bucket[name] = value;
  }
}

function addItem(name, count = 1) {
  setCount(name, getCount(name) + count);
  const seenBucket = materialNames.has(name) ? state.seen.materials : state.seen.items;
  if (!seenBucket.includes(name)) {
    seenBucket.push(name);
  }
}

function removeItem(name, count = 1) {
  if (getCount(name) < count) return false;
  setCount(name, getCount(name) - count);
  return true;
}

function allQuestIdsCompleted(ids, targetState = state) {
  return ids.every((id) => targetState.quests.completed.includes(id));
}

function conditionMet(condition, targetState = state) {
  if (!condition) return true;
  switch (condition.type) {
    case 'storyRead':
      return targetState.stories.read.includes(condition.storyId);
    case 'questClearAll':
      return allQuestIdsCompleted(condition.questIds, targetState);
    default:
      return false;
  }
}

function unlockStory(storyId, { isNew = true } = {}) {
  if (!state.stories.unlocked.includes(storyId)) {
    state.stories.unlocked.push(storyId);
    if (isNew && !state.stories.newIds.includes(storyId)) {
      state.stories.newIds.push(storyId);
    }
    addLog(`메인스토리 ${storyId}이(가) 해금되었습니다.`);
  }
}

function unlockQuest(questId) {
  if (!state.quests.active.includes(questId) && !state.quests.completed.includes(questId)) {
    state.quests.active.push(questId);
    addLog(`퀘스트 ${questId} ${questMap.get(questId).name}이(가) 등록되었습니다.`);
  }
}

function hydrateProgress(targetState = state, options = {}) {
  stories.forEach((story) => {
    const unlocked = story.unlockConditions.length === 0
      || story.unlockConditions.every((condition) => conditionMet(condition, targetState));
    if (unlocked && !targetState.stories.unlocked.includes(story.id)) {
      targetState.stories.unlocked.push(story.id);
      if (!options.initial) {
        addLog(`메인스토리 ${story.id}이(가) 해금되었습니다.`);
      }
      if (!targetState.stories.newIds.includes(story.id)) {
        targetState.stories.newIds.push(story.id);
      }
    }
  });

  quests.forEach((quest) => {
    const unlocked = quest.unlockConditions.every((condition) => conditionMet(condition, targetState));
    if (unlocked && !targetState.quests.active.includes(quest.id) && !targetState.quests.completed.includes(quest.id)) {
      targetState.quests.active.push(quest.id);
      if (!options.initial) {
        addLog(`퀘스트 ${quest.id} ${quest.name}이(가) 등록되었습니다.`);
      }
    }
  });

  items.forEach((item) => {
    if (targetState.recipes.unlocked.includes(item.name)) return;
    const allSeen = item.recipe.map(parseRecipeEntry).every((ingredient) => {
      const seenBucket = materialNames.has(ingredient.name) ? targetState.seen.materials : targetState.seen.items;
      return seenBucket.includes(ingredient.name);
    });
    if (allSeen) {
      targetState.recipes.unlocked.push(item.name);
      if (!options.initial) {
        addLog(`연금 레시피 ${item.name}을(를) 해금했습니다.`);
      }
    }
  });

  if (!targetState.stories.activeId || !targetState.stories.unlocked.includes(targetState.stories.activeId)) {
    targetState.stories.activeId = targetState.stories.unlocked[0] || null;
    targetState.stories.pageIndex = 0;
  }

  if (!options.initial) {
    saveState();
  }
}

function rollGatherResult() {
  const roll = Math.random();
  let cumulative = 0;
  return materials.find((material) => {
    cumulative += material.probability;
    return roll <= cumulative;
  }) || materials[materials.length - 1];
}

function hasGatherTenUnlock(targetState = state) {
  return targetState.stories.read.includes('0400');
}

function gatherMaterial() {
  if (state.col < GATHER_COST) {
    addLog('콜이 부족해 채집에 실패했습니다.');
    render();
    return;
  }

  state.col -= GATHER_COST;
  const found = rollGatherResult();

  addItem(found.name, 1);
  addLog(`채집 성공: ${found.name} x1을(를) 획득했습니다. (-${GATHER_COST}콜)`);
  hydrateProgress();
  render();
}

function gatherMaterialTen() {
  if (!hasGatherTenUnlock()) return;
  if (state.col < GATHER_TEN_COST) {
    addLog('콜이 부족해 10회 채집에 실패했습니다.');
    render();
    return;
  }

  state.col -= GATHER_TEN_COST;
  const results = new Map();
  for (let i = 0; i < 10; i += 1) {
    const found = rollGatherResult();
    addItem(found.name, 1);
    results.set(found.name, (results.get(found.name) || 0) + 1);
  }

  const summary = [...results.entries()].map(([name, count]) => `${name} x${count}`).join(', ');
  addLog(`10회 채집 성공: ${summary} (-${GATHER_TEN_COST}콜)`);
  hydrateProgress();
  render();
}

function canCraft(item) {
  return item.recipe.map(parseRecipeEntry).every((ingredient) => getCount(ingredient.name) >= ingredient.count);
}

function craftItem(itemName) {
  const item = itemMap.get(itemName);
  if (!item) return;
  if (!canCraft(item)) {
    addLog(`재료가 부족해 ${itemName} 제작에 실패했습니다.`);
    render();
    return;
  }

  item.recipe.map(parseRecipeEntry).forEach((ingredient) => removeItem(ingredient.name, ingredient.count));
  addItem(itemName, 1);
  if (!state.crafted.includes(itemName)) {
    state.crafted.push(itemName);
  }
  addLog(`연금 성공: ${itemName} x1을(를) 제작했습니다.`);
  hydrateProgress();
  render();
}

function sellItem(name) {
  const price = itemMap.get(name)?.price;
  if (!price || getCount(name) <= 0) return;
  removeItem(name, 1);
  state.col += price;
  addLog(`판매 완료: ${name} x1을(를) ${price}콜에 판매했습니다.`);
  hydrateProgress();
  render();
}

function formatRewardSummary(rewards = {}) {
  const parts = [];
  if (rewards.col) {
    parts.push(`${rewards.col}콜`);
  }
  (rewards.items || []).forEach(({ name, count }) => {
    parts.push(`${name} x${count}`);
  });
  return parts.join(' + ') || '없음';
}

function completeQuest(questId) {
  const quest = questMap.get(questId);
  const { itemName, count } = quest.objective;
  if (getCount(itemName) < count) {
    addLog(`퀘스트 ${questId} 완료 조건이 아직 부족합니다.`);
    render();
    return;
  }

  removeItem(itemName, count);
  state.col += quest.rewards.col || 0;
  (quest.rewards.items || []).forEach(({ name, count: rewardCount }) => addItem(name, rewardCount));
  state.quests.active = state.quests.active.filter((id) => id !== questId);
  state.quests.completed.push(questId);
  addLog(`퀘스트 완료: ${quest.name} (+${formatRewardSummary(quest.rewards)})`);
  hydrateProgress();
  render();
}

function openStory(storyId) {
  state.stories.activeId = storyId;
  state.stories.pageIndex = 0;
  state.stories.newIds = state.stories.newIds.filter((id) => id !== storyId);
  saveState();
  render();
}

function advanceStory() {
  const story = storyMap.get(state.stories.activeId);
  if (!story) return;
  if (state.stories.pageIndex < story.pages.length - 1) {
    state.stories.pageIndex += 1;
    saveState();
    render();
    return;
  }

  if (!state.stories.read.includes(story.id)) {
    state.stories.read.push(story.id);
    addLog(`메인스토리 ${story.id} ${story.title}을(를) 끝까지 읽었습니다.`);
    if (story.id === '0400') {
      addLog('스토리 0400 보상으로 채집 탭에 10회씩 채집 버튼이 추가되었습니다.');
    }
    (story.rewards.unlockQuestIds || []).forEach(unlockQuest);
  }
  hydrateProgress();
  render();
}

function manualSave() {
  state.manualSaveAt = new Date().toISOString();
  saveState('수동 저장을 완료했습니다.');
  render();
}

function resetSave() {
  if (!window.confirm('정말로 저장 데이터를 초기화할까요? 모든 진행 상태가 사라집니다.')) {
    return;
  }
  state = getInitialState();
  hydrateProgress(state, { initial: true });
  saveState('저장 데이터를 초기화했습니다.');
  currentTab = '메인스토리';
  render();
}

function formatCountStatus(name, need) {
  const have = getCount(name);
  return `${name} ${have}/${need}`;
}

function getActiveStory() {
  return storyMap.get(state.stories.activeId) || storyMap.get(state.stories.unlocked[0]);
}

function renderMenu() {
  const menuTabs = document.getElementById('menu-tabs');
  menuTabs.innerHTML = MENU.map((label) => `
    <button class="menu-tab ${label === currentTab ? 'active' : ''}" data-tab="${label}">${label}</button>
  `).join('');

  menuTabs.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      currentTab = button.dataset.tab;
      render();
    });
  });
}

function renderStoryPanel() {
  const activeStory = getActiveStory();
  const unlockedStories = state.stories.unlocked.map((id) => storyMap.get(id));
  const unreadStories = unlockedStories.filter((story) => !state.stories.read.includes(story.id));
  const latestUnreadStory = unreadStories[unreadStories.length - 1] || null;
  const archiveStories = unlockedStories.filter((story) => state.stories.read.includes(story.id));

  return `
    <article class="content-card">
      <h2 class="section-title">메인스토리</h2>
      <p class="section-copy">최신 안읽은 메인스토리를 바로 열고, 아래에서 현재 스토리를 진행할 수 있습니다. 읽은 스토리 다시보기는 로그 바로 위에서 확인하세요.</p>
      ${latestUnreadStory ? `
        <div class="story-highlight">
          <div>
            <div class="meta-row">
              <span class="info-badge">최신 미열람 스토리</span>
              <span class="meta-pill">스토리 ${latestUnreadStory.id}</span>
            </div>
            <h3>${latestUnreadStory.title}</h3>
            <p class="inline-note">새로 열린 스토리를 바로 이어서 읽을 수 있습니다.</p>
          </div>
          <button class="action-btn" data-open-story="${latestUnreadStory.id}">최신 스토리 열기</button>
        </div>
      ` : '<p class="empty-state">현재 새로 읽을 메인스토리가 없습니다. 퀘스트를 진행해 다음 스토리를 기다려 보세요.</p>'}
    </article>
    ${activeStory ? `
      <section class="story-viewer">
        <div class="meta-row">
          <span class="info-badge">현재 스토리 ${activeStory.id}</span>
          <span class="meta-pill">페이지 ${state.stories.pageIndex + 1} / ${activeStory.pages.length}</span>
          ${state.stories.read.includes(activeStory.id) ? '<span class="meta-pill">다시보기</span>' : '<span class="meta-pill">진행 중</span>'}
        </div>
        <h3>${activeStory.title}</h3>
        <div class="story-lines">
          ${activeStory.pages[state.stories.pageIndex].map((line) => `<p>${line}</p>`).join('')}
        </div>
        <button class="action-btn" data-advance-story="true">${state.stories.pageIndex < activeStory.pages.length - 1 ? '다음' : '읽기 완료'}</button>
      </section>
    ` : ''}
    <article class="content-card">
      <h2 class="section-title">역대 스토리 다시보기</h2>
      <div class="card-grid two-col">
        ${archiveStories.length ? archiveStories.map((story) => `
          <div class="story-card">
            <div>
              <div class="meta-row">
                <span class="meta-pill">스토리 ${story.id}</span>
                <span class="meta-pill">다시보기 가능</span>
              </div>
              <h3>${story.title}</h3>
            </div>
            <button class="small-btn" data-open-story="${story.id}">다시보기</button>
          </div>
        `).join('') : '<p class="empty-state">아직 끝까지 읽은 메인스토리가 없습니다.</p>'}
      </div>
    </article>
    <article class="content-card">
      <h2 class="section-title">최근 행동 로그</h2>
      <ul class="log-list">
        ${state.logs.map((message) => `<li><strong>•</strong> ${message}</li>`).join('')}
      </ul>
    </article>
  `;
}

function renderQuestPanel() {
  const activeQuests = state.quests.active.map((id) => questMap.get(id));
  const completedQuests = state.quests.completed.map((id) => questMap.get(id));

  return `
    <article class="content-card">
      <h2 class="section-title">퀘스트</h2>
      <p class="section-copy">진행 중인 퀘스트와 완료된 퀘스트를 확인할 수 있습니다. 납품 버튼을 누르면 필요한 수량만큼 즉시 차감됩니다.</p>
      <div class="card-grid">
        ${activeQuests.length ? activeQuests.map((quest) => {
          const { itemName, count } = quest.objective;
          const ready = getCount(itemName) >= count;
          return `
            <div class="quest-card">
              <div class="quest-meta">
                <span class="meta-pill">퀘스트 ${quest.id}</span>
                <span class="meta-pill">보상 ${formatRewardSummary(quest.rewards)}</span>
                <span class="meta-pill">${ready ? '완료 가능' : '진행 중'}</span>
              </div>
              <div>
                <h3>${quest.name}</h3>
                <p>${quest.description}</p>
                <p class="inline-note">목표: ${formatCountStatus(itemName, count)}</p>
              </div>
              <button class="small-btn" data-complete-quest="${quest.id}" ${ready ? '' : 'disabled'}>납품하고 완료</button>
            </div>
          `;
        }).join('') : '<p class="empty-state">진행 중인 퀘스트가 없습니다. 스토리를 읽어 새로운 퀘스트를 해금해 보세요.</p>'}
      </div>
    </article>
    <article class="content-card">
      <h2 class="section-title">완료한 퀘스트</h2>
      <div class="card-grid">
        ${completedQuests.length ? completedQuests.map((quest) => `
          <div class="quest-card">
            <div class="quest-meta">
              <span class="meta-pill">퀘스트 ${quest.id}</span>
              <span class="meta-pill">완료</span>
            </div>
            <div>
              <h3>${quest.name}</h3>
              <p>${quest.description}</p>
            </div>
          </div>
        `).join('') : '<p class="empty-state">아직 완료한 퀘스트가 없습니다.</p>'}
      </div>
    </article>
  `;
}

function renderGatherPanel() {
  const gatherTenUnlocked = hasGatherTenUnlock();
  return `
    <article class="content-card">
      <h2 class="section-title">채집</h2>
      <p class="section-copy">채집 1회에는 10콜이 필요합니다. 스토리 0400을 읽으면 100콜을 소모하는 10회 채집도 사용할 수 있습니다.</p>
      <div class="resource-row">
        <span class="info-badge">채집 비용 ${GATHER_COST}콜</span>
        <button class="action-btn" data-gather="true" ${state.col >= GATHER_COST ? '' : 'disabled'}>채집하기</button>
        ${gatherTenUnlocked ? `<button class="action-btn" data-gather-ten="true" ${state.col >= GATHER_TEN_COST ? '' : 'disabled'}>10회씩 채집</button>` : '<span class="inline-note">스토리 0400 완독 시 10회씩 채집 해금</span>'}
      </div>
    </article>
    <article class="content-card">
      <h2 class="section-title">채집 확률표</h2>
      <div class="card-grid two-col">
        ${materials.map((material) => `
          <div class="resource-row">
            <strong>${material.name}</strong>
            <span class="meta-pill">${(material.probability * 100).toFixed(1)}%</span>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function renderAlchemyPanel() {
  const unlockedRecipes = state.recipes.unlocked.map((name) => itemMap.get(name));
  return `
    <article class="content-card">
      <h2 class="section-title">연금</h2>
      <p class="section-copy">필요한 하위 재료를 모두 한 번 이상 보유한 레시피만 표시됩니다. 한 번 해금한 레시피는 이후에도 계속 남습니다.</p>
      <div class="card-grid">
        ${unlockedRecipes.length ? unlockedRecipes.map((item) => {
          const craftable = canCraft(item);
          return `
            <div class="recipe-card">
              <div class="recipe-meta">
                <span class="meta-pill">판매가 ${item.price}콜</span>
                <span class="meta-pill">${craftable ? '제작 가능' : '재료 부족'}</span>
              </div>
              <div>
                <h3>${item.name}</h3>
                <p class="inline-note">레시피: ${item.recipe.join(', ')}</p>
              </div>
              <button class="small-btn" data-craft="${item.name}" ${craftable ? '' : 'disabled'}>1개 제작</button>
            </div>
          `;
        }).join('') : '<p class="empty-state">아직 해금된 레시피가 없습니다. 재료를 모아 보세요.</p>'}
      </div>
    </article>
  `;
}

function renderSalesPanel() {
  const ownedItems = Object.entries(state.inventory.items).filter(([, count]) => count > 0).map(([name, count]) => ({ name, count, price: itemMap.get(name)?.price || 0 }));

  return `
    <article class="content-card">
      <h2 class="section-title">판매</h2>
      <p class="section-copy">현재 보유 중인 조합 아이템만 판매 목록에 표시됩니다. 클릭할 때마다 1개씩 판매됩니다.</p>
      <div class="card-grid">
        ${ownedItems.length ? ownedItems.map((item) => `
          <div class="sale-card">
            <div class="sale-meta">
              <span class="meta-pill">보유 ${item.count}개</span>
              <span class="meta-pill">개당 ${item.price}콜</span>
            </div>
            <div>
              <h3>${item.name}</h3>
            </div>
            <button class="small-btn" data-sell="${item.name}">1개 판매</button>
          </div>
        `).join('') : '<p class="empty-state">판매 가능한 조합 아이템이 없습니다.</p>'}
      </div>
    </article>
  `;
}

function renderContainerPanel() {
  const materialsOwned = Object.entries(state.inventory.materials).filter(([, count]) => count > 0);
  const itemsOwned = Object.entries(state.inventory.items).filter(([, count]) => count > 0);
  return `
    <article class="inventory-section">
      <h2 class="section-title">컨테이너</h2>
      <p class="section-copy">재료와 조합 아이템을 분리해서 보여줍니다. 수량이 0인 항목은 숨겨집니다.</p>
      <div class="inventory-columns">
        <section>
          <h3>재료</h3>
          <ul class="inventory-list">
            ${materialsOwned.length ? materialsOwned.map(([name, count]) => `<li><strong>${name}</strong> x${count}</li>`).join('') : '<li class="empty-state">아직 재료가 없습니다.</li>'}
          </ul>
        </section>
        <section>
          <h3>조합 아이템</h3>
          <ul class="inventory-list">
            ${itemsOwned.length ? itemsOwned.map(([name, count]) => `<li><strong>${name}</strong> x${count}</li>`).join('') : '<li class="empty-state">아직 조합 아이템이 없습니다.</li>'}
          </ul>
        </section>
      </div>
    </article>
  `;
}

function renderSavePanel() {
  return `
    <article class="save-card">
      <h2 class="section-title">세이브</h2>
      <p class="section-copy">게임은 자동 저장되며 새로고침 후에도 진행 상태를 유지합니다. 수동 저장과 저장 초기화 버튼도 사용할 수 있습니다.</p>
      <div class="save-actions">
        <button class="action-btn" data-manual-save="true">지금 저장</button>
        <button class="action-btn warn-btn" data-reset-save="true">저장 초기화</button>
      </div>
      <p class="inline-note">마지막 수동 저장: ${state.manualSaveAt ? new Date(state.manualSaveAt).toLocaleString('ko-KR', { timeZone: 'UTC' }) + ' UTC' : '아직 없음'}</p>
    </article>
  `;
}

function renderPanel() {
  const panelContainer = document.getElementById('panel-container');
  const tabRenderers = {
    '메인스토리': renderStoryPanel,
    '퀘스트': renderQuestPanel,
    '채집': renderGatherPanel,
    '연금': renderAlchemyPanel,
    '판매': renderSalesPanel,
    '컨테이너': renderContainerPanel,
    '세이브': renderSavePanel,
  };

  panelContainer.innerHTML = tabRenderers[currentTab]();

  panelContainer.querySelectorAll('[data-open-story]').forEach((button) => button.addEventListener('click', () => openStory(button.dataset.openStory)));
  panelContainer.querySelector('[data-advance-story="true"]')?.addEventListener('click', advanceStory);
  panelContainer.querySelectorAll('[data-complete-quest]').forEach((button) => button.addEventListener('click', () => completeQuest(button.dataset.completeQuest)));
  panelContainer.querySelector('[data-gather="true"]')?.addEventListener('click', gatherMaterial);
  panelContainer.querySelector('[data-gather-ten="true"]')?.addEventListener('click', gatherMaterialTen);
  panelContainer.querySelectorAll('[data-craft]').forEach((button) => button.addEventListener('click', () => craftItem(button.dataset.craft)));
  panelContainer.querySelectorAll('[data-sell]').forEach((button) => button.addEventListener('click', () => sellItem(button.dataset.sell)));
  panelContainer.querySelector('[data-manual-save="true"]')?.addEventListener('click', manualSave);
  panelContainer.querySelector('[data-reset-save="true"]')?.addEventListener('click', resetSave);
}

function renderSidePanel() {
  const unlockList = document.getElementById('unlock-list');
  const latestStory = [...state.stories.unlocked].reverse()[0];
  const nextActiveQuest = state.quests.active[0];
  document.getElementById('col-display').textContent = `${state.col} 콜`;
  document.getElementById('progress-summary').textContent = nextActiveQuest
    ? `${nextActiveQuest} ${questMap.get(nextActiveQuest).name}`
    : latestStory
      ? `${latestStory} ${storyMap.get(latestStory).title}`
      : '새로운 해금을 기다리는 중';

  const unlockEntries = [
    latestStory ? `최근 해금 스토리: ${latestStory} ${storyMap.get(latestStory).title}` : '해금된 스토리가 없습니다.',
    nextActiveQuest ? `진행 중 퀘스트: ${nextActiveQuest} ${questMap.get(nextActiveQuest).name}` : '진행 중 퀘스트가 없습니다.',
    state.recipes.unlocked.length ? `해금된 레시피: ${state.recipes.unlocked.length}종` : '해금된 레시피가 없습니다.',
  ];
  unlockList.innerHTML = unlockEntries.map((entry) => `<li>${entry}</li>`).join('');

}

function render() {
  renderMenu();
  renderPanel();
  renderSidePanel();
  saveState();
}

state = loadState();
render();
