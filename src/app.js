// API_URL is baked in at build time by scripts/build.js. Empty string means
// "same-origin" -- requests go to /api/... and /readyz on whatever host is
// serving this page, which is what you want behind a reverse proxy.
const API_URL = "__API_URL__";

const READYZ_POLL_MS = 5000;

const el = {
  badgePostgres: document.getElementById("badge-postgres"),
  badgeRedis: document.getElementById("badge-redis"),
  statusError: document.getElementById("status-error"),

  addTaskForm: document.getElementById("add-task-form"),
  taskTitleInput: document.getElementById("task-title"),
  tasksError: document.getElementById("tasks-error"),
  cacheIndicator: document.getElementById("cache-indicator"),
  taskList: document.getElementById("task-list"),
  taskEmpty: document.getElementById("task-empty"),

  refreshStatsBtn: document.getElementById("refresh-stats"),
  statsError: document.getElementById("stats-error"),
  statVisits: document.getElementById("stat-visits"),
  statTaskcount: document.getElementById("stat-taskcount"),
  statHostname: document.getElementById("stat-hostname"),
  statVersion: document.getElementById("stat-version"),
  statUptime: document.getElementById("stat-uptime"),
};

function apiUrl(path) {
  return `${API_URL}${path}`;
}

function showError(node, message) {
  if (!message) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = message;
}

function setBadge(node, label, state) {
  // state: "up" | "down" | "unknown"
  node.classList.remove("badge-up", "badge-down", "badge-unknown");
  node.classList.add(`badge-${state}`);
  const textEl = node.querySelector("span:last-child");
  const stateLabel = state === "up" ? "up" : state === "down" ? "down" : "checking…";
  textEl.textContent = `${label}: ${stateLabel}`;
}

async function pollReadyz() {
  try {
    const res = await fetch(apiUrl("/readyz"));
    // /readyz returns 200 when fully up, 503 when a dependency is down --
    // either way the body tells us per-service status, so read it regardless.
    let body;
    try {
      body = await res.json();
    } catch {
      body = {};
    }
    setBadge(el.badgePostgres, "Postgres", body.postgres === "up" ? "up" : "down");
    setBadge(el.badgeRedis, "Redis", body.redis === "up" ? "up" : "down");
    showError(el.statusError, "");
  } catch (err) {
    setBadge(el.badgePostgres, "Postgres", "unknown");
    setBadge(el.badgeRedis, "Redis", "unknown");
    showError(el.statusError, "API unreachable: could not load status.");
  }
}

function formatTaskItem(task) {
  const li = document.createElement("li");
  li.className = "task-item" + (task.done ? " done" : "");
  li.dataset.id = task.id;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = !!task.done;
  checkbox.id = `task-checkbox-${task.id}`;
  checkbox.setAttribute("aria-label", `Mark "${task.title}" as done`);
  checkbox.addEventListener("change", () => toggleTask(task.id, checkbox.checked));

  const title = document.createElement("span");
  title.className = "task-title";
  title.textContent = task.title;

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.setAttribute("aria-label", `Delete "${task.title}"`);
  deleteBtn.addEventListener("click", () => deleteTask(task.id));

  li.append(checkbox, title, deleteBtn);
  return li;
}

function renderTasks(tasks) {
  el.taskList.innerHTML = "";
  if (!tasks.length) {
    el.taskEmpty.hidden = false;
    return;
  }
  el.taskEmpty.hidden = true;
  for (const task of tasks) {
    el.taskList.appendChild(formatTaskItem(task));
  }
}

async function loadTasks() {
  try {
    const res = await fetch(apiUrl("/api/tasks"));
    if (!res.ok) {
      throw new Error(`Failed to load tasks (${res.status})`);
    }
    const cacheStatus = res.headers.get("X-Cache");
    if (cacheStatus) {
      el.cacheIndicator.hidden = false;
      el.cacheIndicator.textContent = `Last load: cache ${cacheStatus}`;
    } else {
      el.cacheIndicator.hidden = true;
    }
    const tasks = await res.json();
    renderTasks(tasks);
    showError(el.tasksError, "");
  } catch (err) {
    showError(el.tasksError, "Could not load tasks. Is the API reachable?");
  }
}

async function addTask(title) {
  try {
    const res = await fetch(apiUrl("/api/tasks"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      let message = `Failed to add task (${res.status})`;
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch {
        // ignore body parse errors, keep default message
      }
      throw new Error(message);
    }
    showError(el.tasksError, "");
    await loadTasks();
  } catch (err) {
    showError(el.tasksError, err.message || "Could not add task.");
  }
}

async function toggleTask(id, done) {
  try {
    const res = await fetch(apiUrl(`/api/tasks/${id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    if (!res.ok) {
      throw new Error(`Failed to update task (${res.status})`);
    }
    showError(el.tasksError, "");
    await loadTasks();
  } catch (err) {
    showError(el.tasksError, "Could not update task.");
    await loadTasks();
  }
}

async function deleteTask(id) {
  try {
    const res = await fetch(apiUrl(`/api/tasks/${id}`), { method: "DELETE" });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete task (${res.status})`);
    }
    showError(el.tasksError, "");
    await loadTasks();
  } catch (err) {
    showError(el.tasksError, "Could not delete task.");
  }
}

function formatUptime(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "–";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return `${h}h ${m}m ${s}s`;
}

async function loadStats() {
  try {
    const res = await fetch(apiUrl("/api/stats"));
    if (!res.ok) {
      throw new Error(`Failed to load stats (${res.status})`);
    }
    const stats = await res.json();
    el.statVisits.textContent = stats.visits ?? "–";
    el.statTaskcount.textContent = stats.taskCount ?? "–";
    el.statHostname.textContent = stats.hostname ?? "–";
    el.statVersion.textContent = stats.version ?? "–";
    el.statUptime.textContent = formatUptime(stats.uptimeSeconds);
    showError(el.statsError, "");
  } catch (err) {
    showError(el.statsError, "Could not load stats. Is the API reachable?");
  }
}

el.addTaskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = el.taskTitleInput.value.trim();
  if (!title) return;
  el.taskTitleInput.value = "";
  addTask(title);
});

el.refreshStatsBtn.addEventListener("click", () => loadStats());

pollReadyz();
setInterval(pollReadyz, READYZ_POLL_MS);
loadTasks();
loadStats();
