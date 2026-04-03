import "./style.css";
import { optimizeFoodPlan, type ResourceInput } from "./solver";

const resourceFields = [
  { key: "water", label: "水" },
  { key: "rice", label: "米" },
  { key: "flour", label: "面粉" },
  { key: "sugar", label: "糖" },
  { key: "dates", label: "枣" },
  { key: "wheat", label: "麦仁" },
] as const;

const defaultInput: ResourceInput = {
  water: 0,
  rice: 0,
  flour: 0,
  sugar: 0,
  dates: 0,
  wheat: 0,
};

// ── Sidebar recipe data ───────────────────────────────────────────────────────
// All recipes from 食材配置.txt, in original order.
// Excluded recipes are shown grayed-out with a reason tag.

interface SidebarRecipe {
  label: string;
  ingredients: string;
  excluded: boolean;
  excludeReason?: string;
}

const allRecipesForSidebar: SidebarRecipe[] = [
  { label: "寒食粥", ingredients: "水×4 · 米×1", excluded: false },
  { label: "醴酪", ingredients: "糖×2 · 麦仁×3 · 水×3", excluded: false },
  { label: "子福", ingredients: "枣×3 · 水×2 · 面粉×3", excluded: false },
  {
    label: "清明馃",
    ingredients: "面×4 · 艾草×5 · 水×3",
    excluded: true,
    excludeReason: "无星辉券",
  },
  { label: "寒食饼", ingredients: "面粉×4 · 水×1", excluded: false },
  {
    label: "子推燕",
    ingredients: "糖×2 · 水×3 · 面粉×5",
    excluded: true,
    excludeReason: "被支配",
  },
  {
    label: "青精饭",
    ingredients: "米×3 · 乌饭树叶×5 · 水×4",
    excluded: true,
    excludeReason: "无星辉券",
  },
  { label: "寒食面", ingredients: "米×1 · 水×1 · 面粉×3", excluded: false },
  { label: "寒食浆", ingredients: "糖×1 · 水×2 · 面粉×2", excluded: false },
  { label: "饧", ingredients: "糖×6 · 水×4", excluded: false },
];

const sidebarHTML = allRecipesForSidebar
  .map(
    (r) => `
      <div class="recipe-card${r.excluded ? " excluded" : ""}">
        <p class="recipe-name">
          ${r.label}${r.excluded ? ` <span class="recipe-tag">${r.excludeReason}</span>` : ""}
        </p>
        <p class="recipe-ingr">${r.ingredients}</p>
      </div>
    `,
  )
  .join("");

// ── App shell ─────────────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root was not found.");
}

app.innerHTML = `
  <main class="page">
    <div class="sidebar-stack">
      <aside class="sidebar">
        <h2 class="sidebar-title">寒食食谱</h2>
        ${sidebarHTML}
      </aside>

      <aside class="sidebar-panel">
        <p class="sidebar-text">
          作者：
          <a href="https://github.com/Yousa-Mirage" target="_blank" rel="noreferrer">
          天然純真
          </a>
        </p>
        <p class="sidebar-text">
          开源地址：
          <a href="https://github.com/Yousa-Mirage/naruto-hanshi" target="_blank" rel="noreferrer">
            https://github.com/Yousa-Mirage/naruto-hanshi
          </a>
        </p>
        <p class="sidebar-text">食谱信息来自网络社群</p>
      </aside>
    </div>

    <div class="content">
      <section class="panel hero">
        <h1>《火影忍者Online》寒食春宴计算器（2026.4.3）</h1>
        <p class="intro">输入现有食材数量，计算最大化星辉券的制作方案。每份食物等于 10 个星辉券。</p>
        <p class="note">已排除：清明馃（不产出星辉券）、青精饭（不产出星辉券）、子推燕（被寒食浆严格支配）。</p>
      </section>

      <section class="panel">
        <form id="planner-form" class="form-grid"></form>
        <div class="actions">
          <button id="solve-button" type="submit" form="planner-form">计算方案</button>
        </div>
      </section>

      <section id="result" class="panel result"></section>
    </div>
  </main>
`;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const plannerForm = document.querySelector<HTMLFormElement>("#planner-form");
const resultPanel = document.querySelector<HTMLElement>("#result");

if (!plannerForm || !resultPanel) {
  throw new Error("Required UI elements were not found.");
}

const form = plannerForm;
const result = resultPanel;

// ── Form population ───────────────────────────────────────────────────────────

form.innerHTML = resourceFields
  .map(
    ({ key, label }) => `
      <label class="field">
        <span>${label}</span>
        <div class="number-control">
          <input name="${key}" type="number" min="0" step="1" value="0" inputmode="numeric" />
          <div class="stepper" aria-hidden="true">
            <button type="button" class="stepper-button" data-step="up" tabindex="-1">+</button>
            <button type="button" class="stepper-button" data-step="down" tabindex="-1">−</button>
          </div>
        </div>
      </label>
    `,
  )
  .join("");

// ── Input / output helpers ────────────────────────────────────────────────────

function readInput(): ResourceInput {
  const formData = new FormData(form);

  return resourceFields.reduce<ResourceInput>(
    (input, { key }) => {
      const rawValue = formData.get(key);
      const value = typeof rawValue === "string" ? Number(rawValue) : 0;
      input[key] = Number.isFinite(value) ? value : 0;
      return input;
    },
    { ...defaultInput },
  );
}

function renderResult(input: ResourceInput): void {
  const plan = optimizeFoodPlan(input);

  const itemRows =
    plan.items.length > 0
      ? plan.items
          .map(
            (item) => `
              <tr>
                <td>${item.label}</td>
                <td>${item.count}</td>
              </tr>
            `,
          )
          .join("")
      : '<tr><td colspan="2">当前食材无法制作任何可用食物。</td></tr>';

  const usageRows = resourceFields
    .map(
      ({ key, label }) => `
        <tr>
          <td>${label}</td>
          <td>${plan.used[key]}</td>
          <td>${plan.remaining[key]}</td>
        </tr>
      `,
    )
    .join("");

  result.innerHTML = `
    <div class="summary">
      <div>
        <p class="summary-label">最大食物数</p>
        <p class="summary-value">${plan.totalFoods}</p>
      </div>
      <div>
        <p class="summary-label">参与求解的品类</p>
        <p class="summary-value">${plan.items.length}</p>
      </div>
    </div>

    <div class="tables">
      <section>
        <h2>制作方案</h2>
        <table>
          <thead>
            <tr>
              <th>食物</th>
              <th>数量</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>
      </section>

      <section>
        <h2>食材消耗</h2>
        <table>
          <thead>
            <tr>
              <th>食材</th>
              <th>已用</th>
              <th>剩余</th>
            </tr>
          </thead>
          <tbody>${usageRows}</tbody>
        </table>
      </section>
    </div>
  `;
}

// ── Event binding ─────────────────────────────────────────────────────────────

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderResult(readInput());
});

form.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLButtonElement>(".stepper-button");
  if (!button) {
    return;
  }

  const control = button.closest(".number-control");
  const input = control?.querySelector<HTMLInputElement>(
    'input[type="number"]',
  );
  if (!input) {
    return;
  }

  if (button.dataset.step === "up") {
    input.stepUp();
  } else {
    input.stepDown();
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
});

renderResult(defaultInput);
