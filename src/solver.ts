import { solve, type Model, type Solution } from "yalps";

// resourceKeys 是所有资源名称的单一来源，ResourceName 类型由此推导，避免两处分别维护导致不同步。
const resourceKeys = [
  "water",
  "rice",
  "flour",
  "sugar",
  "dates",
  "wheat",
] as const;

export type ResourceName = (typeof resourceKeys)[number];

export interface ResourceInput {
  water: number;
  rice: number;
  flour: number;
  sugar: number;
  dates: number;
  wheat: number;
}

export interface RecipeDefinition {
  key: string;
  label: string;
  cost: Partial<Record<ResourceName, number>>;
}

export interface PlanItem {
  key: string;
  label: string;
  count: number;
}

export interface OptimizationResult {
  totalFoods: number;
  items: PlanItem[];
  used: ResourceInput;
  remaining: ResourceInput;
  raw: Solution;
}

export const recipes: RecipeDefinition[] = [
  { key: "hanshi_zhou", label: "寒食粥", cost: { water: 4, rice: 1 } },
  { key: "li_lao", label: "醴酪", cost: { sugar: 2, wheat: 3, water: 3 } },
  { key: "zi_fu", label: "子福", cost: { dates: 3, water: 2, flour: 3 } },
  { key: "hanshi_bing", label: "寒食饼", cost: { flour: 4, water: 1 } },
  {
    key: "hanshi_mian",
    label: "寒食面",
    cost: { rice: 1, water: 1, flour: 3 },
  },
  {
    key: "hanshi_jiang",
    label: "寒食浆",
    cost: { sugar: 1, water: 2, flour: 2 },
  },
  { key: "tang", label: "饧", cost: { sugar: 6, water: 4 } },
];

// 清明馃（需要"草"）和青精饭（需要"叶"）使用本求解器不含的食材，故排除。
// 子推燕（2糖+3水+5面）被寒食浆（1糖+2水+2面）严格支配：
// 两者同样产出 1 道菜，但寒食浆在糖、水、面三种食材上消耗均严格更少，
// 节省出的资源可用于制作更多食物，因此子推燕在任何最优解中均不会出现。
export const ignoredRecipes = ["清明馃", "青精饭", "子推燕"];

function normalizeResource(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeInput(input: ResourceInput): ResourceInput {
  const result = {} as ResourceInput;
  for (const key of resourceKeys) {
    result[key] = normalizeResource(input[key]);
  }
  return result;
}

function zeroResources(): ResourceInput {
  const result = {} as ResourceInput;
  for (const key of resourceKeys) {
    result[key] = 0;
  }
  return result;
}

function buildModel(input: ResourceInput): Model {
  const variables = Object.fromEntries(
    recipes.map((recipe) => {
      const variable: Record<string, number> = { totalFoods: 1 };

      for (const resource of resourceKeys) {
        const cost = recipe.cost[resource];
        // 使用 !== undefined 而非直接 if (cost)，以正确处理 cost === 0 的边界情况。
        if (cost !== undefined) {
          variable[resource] = cost;
        }
      }

      return [recipe.key, variable];
    }),
  );

  return {
    direction: "maximize",
    objective: "totalFoods",
    constraints: {
      water: { max: input.water },
      rice: { max: input.rice },
      flour: { max: input.flour },
      sugar: { max: input.sugar },
      dates: { max: input.dates },
      wheat: { max: input.wheat },
    },
    variables,
    integers: true,
  };
}

// 接收 Map 而非数组，将单次调用的查找复杂度从 O(n) 降至 O(1)。
// 调用方在循环外统一构建 Map，整体从 O(r×n) 降至 O(n+r)。
function extractCount(variableMap: Map<string, number>, key: string): number {
  const value = variableMap.get(key);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
}

function calculateUsedResources(items: PlanItem[]): ResourceInput {
  const used = zeroResources();

  for (const item of items) {
    const recipe = recipes.find((entry) => entry.key === item.key);
    if (!recipe || item.count <= 0) {
      continue;
    }

    for (const resource of resourceKeys) {
      used[resource] += (recipe.cost[resource] ?? 0) * item.count;
    }
  }

  return used;
}

export function optimizeFoodPlan(input: ResourceInput): OptimizationResult {
  const normalizedInput = normalizeInput(input);
  const raw = solve(buildModel(normalizedInput), {
    includeZeroVariables: true,
  });

  if (raw.status !== "optimal") {
    return {
      totalFoods: 0,
      items: [],
      used: zeroResources(),
      remaining: normalizedInput,
      raw,
    };
  }

  // 一次性建立 Map，供后续所有食谱的 O(1) 查找使用。
  const variableMap = new Map(raw.variables);

  const items = recipes
    .map((recipe) => ({
      key: recipe.key,
      label: recipe.label,
      count: extractCount(variableMap, recipe.key),
    }))
    .filter((item) => item.count > 0);

  const used = calculateUsedResources(items);

  // Math.max(0, ...) 防止求解器浮点误差产生微小负值。
  const remaining = {} as ResourceInput;
  for (const key of resourceKeys) {
    remaining[key] = Math.max(0, normalizedInput[key] - used[key]);
  }

  return {
    totalFoods: items.reduce((sum, item) => sum + item.count, 0),
    items,
    used,
    remaining,
    raw,
  };
}
