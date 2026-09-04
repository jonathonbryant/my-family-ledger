const { useState, useEffect, useRef } = React;
const STORAGE_KEY = "family-ledger-state-v1";
const uid = () => Math.random().toString(36).slice(2, 10);
const todayKey = () => new Date().toISOString().slice(0, 10);
const isoWeekKey = (d = new Date()) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${weekNo}`;
};
const fmtTime = ts => new Date(ts).toLocaleString(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});
const fmtMoney = n => `${n < 0 ? "-" : ""}${Math.abs(n)}`;
function defaultState() {
  return {
    balance: 0,
    pin: "0000",
    kidPin: "2013",
    sections: [{
      id: uid(),
      name: "Chores",
      tasks: [{
        id: uid(),
        title: "Make bed",
        credits: 3,
        freq: "daily",
        deadline: null
      }, {
        id: uid(),
        title: "Unload dishwasher",
        credits: 5,
        freq: "daily",
        deadline: null
      }, {
        id: uid(),
        title: "Deep clean bedroom",
        credits: 15,
        freq: "weekly",
        deadline: null
      }]
    }, {
      id: uid(),
      name: "Homeschool",
      tasks: [{
        id: uid(),
        title: "Finish math lesson",
        credits: 10,
        freq: "daily",
        deadline: null
      }, {
        id: uid(),
        title: "Reading log entry",
        credits: 5,
        freq: "daily",
        deadline: null
      }]
    }, {
      id: uid(),
      name: "Outdoors",
      tasks: [{
        id: uid(),
        title: "30 min outside, no screen",
        credits: 8,
        freq: "daily",
        deadline: null
      }]
    }, {
      id: uid(),
      name: "Business",
      tasks: [{
        id: uid(),
        title: "Restock & price eBay item",
        credits: 12,
        freq: "once",
        deadline: null
      }]
    }],
    rewards: [{
      id: uid(),
      name: "Screen time",
      cost: 5,
      duration: true,
      unitMinutes: 15
    }, {
      id: uid(),
      name: "Dessert",
      cost: 10,
      duration: false
    }, {
      id: uid(),
      name: "Pick family dinner",
      cost: 15,
      duration: false
    }, {
      id: uid(),
      name: "Movie trip",
      cost: 40,
      duration: false
    }],
    pending: [],
    // {id, sectionId, taskId, title, credits, submittedAt}
    ledger: [],
    // {id, kind:'earn'|'spend'|'reject', desc, amount, ts, balanceAfter}
    activeSessions: [],
    // {id, rewardId, name, minutes, startedAt, cost}
    completedOnce: {},
    // taskId -> true
    completedPeriod: {} // taskId -> periodKey (today or isoweek) when last approved
  };
}
const COLORS = {
  paper: "#E7E9EC",
  paperLine: "#C6CBD3",
  ink: "#0F1B2D",
  inkSoft: "#54606F",
  forest: "#041E42",
  forestSoft: "#0B2C55",
  brass: "#9AA1AC",
  brassLight: "#D7DBE1",
  earn: "#2F7A4D",
  spend: "#9B2C2C"
};
function App() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [mode, setMode] = useState(null); // null | 'kid' | 'parent'
  const [tab, setTab] = useState("tasks"); // tasks | store | ledger | approvals | manage
  const [activeSection, setActiveSection] = useState(null);
  const [pinPrompt, setPinPrompt] = useState(false);
  const [pinTarget, setPinTarget] = useState(null); // 'kid' | 'parent'
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [toast, setToast] = useState(null);
  const saveTimer = useRef(null);
  const firstLoad = useRef(true);
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, true);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setState({
            ...defaultState(),
            ...parsed
          });
        } else {
          setState(defaultState());
        }
      } catch (e) {
        console.error("load failed", e);
        setLoadError(e && e.message ? e.message : String(e));
        setState(defaultState());
      }
      setLoaded(true);
    })();
  }, []);
  useEffect(() => {
    if (!loaded || !state) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      if (state.sections.length && !activeSection) setActiveSection(state.sections[0].id);
      return;
    }
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify(state), true);
        setLoadError(null);
      } catch (e) {
        console.error("save failed", e);
        setLoadError(e && e.message ? e.message : String(e));
      }
    })();
  }, [state, loaded]);
  useEffect(() => {
    if (state && state.sections.length && !activeSection) {
      setActiveSection(state.sections[0].id);
    }
  }, [state]);
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  }
  if (!loaded || !state) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...styles.wrap,
        alignItems: "center",
        justifyContent: "center",
        display: "flex"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: "Fraunces, serif",
        color: COLORS.forest,
        fontSize: 18
      }
    }, "Opening the ledger…"));
  }
  function isTaskAvailable(task) {
    if (task.freq === "once") return !state.completedOnce[task.id];
    const key = task.freq === "daily" ? todayKey() : isoWeekKey();
    return state.completedPeriod[task.id] !== key;
  }
  function isPending(taskId) {
    return state.pending.some(p => p.taskId === taskId);
  }

  // ---- kid actions ----
  function submitTask(section, task) {
    setState(s => ({
      ...s,
      pending: [...s.pending, {
        id: uid(),
        sectionId: section.id,
        taskId: task.id,
        title: task.title,
        credits: task.credits,
        submittedAt: Date.now()
      }]
    }));
    showToast(`Sent "${task.title}" for approval`);
  }
  function redeemInstant(reward) {
    if (state.balance < reward.cost) {
      showToast("Not enough credits yet");
      return;
    }
    setState(s => {
      const newBal = s.balance - reward.cost;
      return {
        ...s,
        balance: newBal,
        ledger: [{
          id: uid(),
          kind: "spend",
          desc: reward.name,
          amount: -reward.cost,
          ts: Date.now(),
          balanceAfter: newBal
        }, ...s.ledger]
      };
    });
    showToast(`Redeemed ${reward.name}`);
  }
  function startSession(reward, units) {
    const cost = reward.cost * units;
    if (state.balance < cost) {
      showToast("Not enough credits yet");
      return;
    }
    const minutes = reward.unitMinutes * units;
    setState(s => {
      const newBal = s.balance - cost;
      return {
        ...s,
        balance: newBal,
        activeSessions: [...s.activeSessions, {
          id: uid(),
          rewardId: reward.id,
          name: reward.name,
          minutes,
          startedAt: Date.now(),
          cost
        }],
        ledger: [{
          id: uid(),
          kind: "spend",
          desc: `${reward.name} (${minutes} min)`,
          amount: -cost,
          ts: Date.now(),
          balanceAfter: newBal
        }, ...s.ledger]
      };
    });
    showToast(`${reward.name} started — ${minutes} min`);
  }
  function endSession(session) {
    setState(s => ({
      ...s,
      activeSessions: s.activeSessions.filter(a => a.id !== session.id)
    }));
  }

  // ---- parent actions ----
  function approve(p) {
    setState(s => {
      const newBal = s.balance + p.credits;
      const task = s.sections.flatMap(sec => sec.tasks).find(t => t.id === p.taskId);
      const completedOnce = {
        ...s.completedOnce
      };
      const completedPeriod = {
        ...s.completedPeriod
      };
      if (task) {
        if (task.freq === "once") completedOnce[task.id] = true;else completedPeriod[task.id] = task.freq === "daily" ? todayKey() : isoWeekKey();
      }
      return {
        ...s,
        balance: newBal,
        pending: s.pending.filter(x => x.id !== p.id),
        completedOnce,
        completedPeriod,
        ledger: [{
          id: uid(),
          kind: "earn",
          desc: p.title,
          amount: p.credits,
          ts: Date.now(),
          balanceAfter: newBal
        }, ...s.ledger]
      };
    });
  }
  function reject(p) {
    setState(s => ({
      ...s,
      pending: s.pending.filter(x => x.id !== p.id)
    }));
  }
  function tryEnterParent() {
    setPinTarget("parent");
    setPinInput("");
    setPinError("");
    setPinPrompt(true);
  }
  function tryEnterKid() {
    setPinTarget("kid");
    setPinInput("");
    setPinError("");
    setPinPrompt(true);
  }
  function submitPin() {
    const target = pinTarget;
    const correct = target === "kid" ? state.kidPin : state.pin;
    if (pinInput === correct) {
      setMode(target);
      setPinPrompt(false);
      setTab(target === "kid" ? "tasks" : "approvals");
    } else {
      setPinError("Wrong PIN");
    }
  }

  // ---- manage (parent) actions ----
  function addSection(name) {
    if (!name.trim()) return;
    setState(s => ({
      ...s,
      sections: [...s.sections, {
        id: uid(),
        name: name.trim(),
        tasks: []
      }]
    }));
  }
  function removeSection(id) {
    setState(s => ({
      ...s,
      sections: s.sections.filter(sec => sec.id !== id)
    }));
    if (activeSection === id) setActiveSection(null);
  }
  function addTask(sectionId, task) {
    setState(s => ({
      ...s,
      sections: s.sections.map(sec => sec.id === sectionId ? {
        ...sec,
        tasks: [...sec.tasks, {
          id: uid(),
          ...task
        }]
      } : sec)
    }));
  }
  function removeTask(sectionId, taskId) {
    setState(s => ({
      ...s,
      sections: s.sections.map(sec => sec.id === sectionId ? {
        ...sec,
        tasks: sec.tasks.filter(t => t.id !== taskId)
      } : sec)
    }));
  }
  function updateTask(sectionId, taskId, patch) {
    setState(s => ({
      ...s,
      sections: s.sections.map(sec => sec.id === sectionId ? {
        ...sec,
        tasks: sec.tasks.map(t => t.id === taskId ? {
          ...t,
          ...patch
        } : t)
      } : sec)
    }));
  }
  function renameSection(sectionId, name) {
    setState(s => ({
      ...s,
      sections: s.sections.map(sec => sec.id === sectionId ? {
        ...sec,
        name
      } : sec)
    }));
  }
  function addReward(reward) {
    setState(s => ({
      ...s,
      rewards: [...s.rewards, {
        id: uid(),
        ...reward
      }]
    }));
  }
  function removeReward(id) {
    setState(s => ({
      ...s,
      rewards: s.rewards.filter(r => r.id !== id)
    }));
  }
  function updateReward(id, patch) {
    setState(s => ({
      ...s,
      rewards: s.rewards.map(r => r.id === id ? {
        ...r,
        ...patch
      } : r)
    }));
  }
  function updatePin(newPin) {
    setState(s => ({
      ...s,
      pin: newPin
    }));
  }
  function updateKidPin(newPin) {
    setState(s => ({
      ...s,
      kidPin: newPin
    }));
  }
  function adjustBalance(delta, reason) {
    setState(s => {
      const newBal = s.balance + delta;
      return {
        ...s,
        balance: newBal,
        ledger: [{
          id: uid(),
          kind: delta >= 0 ? "earn" : "spend",
          desc: reason || "Manual adjustment",
          amount: delta,
          ts: Date.now(),
          balanceAfter: newBal
        }, ...s.ledger]
      };
    });
  }
  const currentSection = state.sections.find(s => s.id === activeSection) || state.sections[0];
  if (!mode) {
    return /*#__PURE__*/React.createElement("div", {
      style: styles.wrap
    }, /*#__PURE__*/React.createElement(GlobalStyle, null), /*#__PURE__*/React.createElement("div", {
      style: styles.gateWrap
    }, /*#__PURE__*/React.createElement("div", {
      style: styles.gateEyebrow
    }, "Family Ledger"), /*#__PURE__*/React.createElement("div", {
      style: styles.gateSub
    }, "Who's this?"), /*#__PURE__*/React.createElement("div", {
      style: styles.gateButtons
    }, /*#__PURE__*/React.createElement("button", {
      style: styles.gateBtn,
      onClick: tryEnterKid
    }, "Kid"), /*#__PURE__*/React.createElement("button", {
      style: styles.gateBtn,
      onClick: tryEnterParent
    }, "Parent")), loadError && /*#__PURE__*/React.createElement("div", {
      style: styles.errorBanner
    }, "Storage issue: ", loadError)), pinPrompt && /*#__PURE__*/React.createElement(PinModal, {
      value: pinInput,
      setValue: setPinInput,
      error: pinError,
      onCancel: () => setPinPrompt(false),
      onSubmit: submitPin
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    style: styles.wrap
  }, /*#__PURE__*/React.createElement(GlobalStyle, null), /*#__PURE__*/React.createElement(Header, {
    balance: state.balance,
    mode: mode,
    pendingCount: state.pending.length,
    onSwitchKid: tryEnterKid,
    onSwitchParent: tryEnterParent
  }), /*#__PURE__*/React.createElement("div", {
    style: styles.body
  }, mode === "kid" && tab === "tasks" && /*#__PURE__*/React.createElement(TasksView, {
    state: state,
    currentSection: currentSection,
    sections: state.sections,
    activeSection: activeSection,
    setActiveSection: setActiveSection,
    isTaskAvailable: isTaskAvailable,
    isPending: isPending,
    onSubmit: submitTask
  }), mode === "kid" && tab === "store" && /*#__PURE__*/React.createElement(StoreView, {
    state: state,
    onRedeem: redeemInstant,
    onStart: startSession,
    onEnd: endSession
  }), tab === "ledger" && /*#__PURE__*/React.createElement(LedgerView, {
    state: state
  }), mode === "parent" && tab === "approvals" && /*#__PURE__*/React.createElement(ApprovalsView, {
    pending: state.pending,
    onApprove: approve,
    onReject: reject
  }), mode === "parent" && tab === "manage" && /*#__PURE__*/React.createElement(ManageView, {
    state: state,
    addSection: addSection,
    removeSection: removeSection,
    addTask: addTask,
    removeTask: removeTask,
    addReward: addReward,
    removeReward: removeReward,
    updateReward: updateReward,
    updateTask: updateTask,
    renameSection: renameSection,
    updatePin: updatePin,
    updateKidPin: updateKidPin,
    adjustBalance: adjustBalance
  })), /*#__PURE__*/React.createElement(TabBar, {
    mode: mode,
    tab: tab,
    setTab: setTab,
    pendingCount: state.pending.length
  }), loadError && /*#__PURE__*/React.createElement("div", {
    style: styles.errorBannerFixed
  }, "Storage issue: ", loadError), toast && /*#__PURE__*/React.createElement("div", {
    style: styles.toast
  }, toast), pinPrompt && /*#__PURE__*/React.createElement(PinModal, {
    value: pinInput,
    setValue: setPinInput,
    error: pinError,
    onCancel: () => setPinPrompt(false),
    onSubmit: submitPin
  }));
}
function GlobalStyle() {
  return /*#__PURE__*/React.createElement("style", null, `
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap');
      * { box-sizing: border-box; }
      button { font-family: inherit; cursor: pointer; }
      input { font-family: inherit; }
    `);
}
function Header({
  balance,
  mode,
  pendingCount,
  onSwitchKid,
  onSwitchParent
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: styles.header
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: styles.headerEyebrow
  }, "Family Ledger"), /*#__PURE__*/React.createElement("div", {
    style: styles.balanceRow
  }, /*#__PURE__*/React.createElement("span", {
    style: styles.balanceNum
  }, balance), /*#__PURE__*/React.createElement("span", {
    style: styles.balanceLabel
  }, "credits"))), /*#__PURE__*/React.createElement("div", {
    style: styles.modeToggle
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onSwitchKid,
    style: {
      ...styles.modeBtn,
      ...(mode === "kid" ? styles.modeBtnActive : {})
    }
  }, "Kid"), /*#__PURE__*/React.createElement("button", {
    onClick: onSwitchParent,
    style: {
      ...styles.modeBtn,
      ...(mode === "parent" ? styles.modeBtnActive : {})
    }
  }, "Parent", pendingCount > 0 && mode !== "parent" ? ` (${pendingCount})` : "")));
}
function TabBar({
  mode,
  tab,
  setTab,
  pendingCount
}) {
  const kidTabs = [{
    id: "tasks",
    label: "Tasks"
  }, {
    id: "store",
    label: "Store"
  }, {
    id: "ledger",
    label: "History"
  }];
  const parentTabs = [{
    id: "approvals",
    label: `Approve${pendingCount ? ` · ${pendingCount}` : ""}`
  }, {
    id: "ledger",
    label: "History"
  }, {
    id: "manage",
    label: "Manage"
  }];
  const tabs = mode === "kid" ? kidTabs : parentTabs;
  return /*#__PURE__*/React.createElement("div", {
    style: styles.tabBar
  }, tabs.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setTab(t.id),
    style: {
      ...styles.tabBtn,
      ...(tab === t.id ? styles.tabBtnActive : {})
    }
  }, t.label)));
}
function SectionPills({
  sections,
  activeSection,
  setActiveSection
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: styles.pillRow
  }, sections.map(sec => /*#__PURE__*/React.createElement("button", {
    key: sec.id,
    onClick: () => setActiveSection(sec.id),
    style: {
      ...styles.pill,
      ...(activeSection === sec.id ? styles.pillActive : {})
    }
  }, sec.name)));
}
function TasksView({
  sections,
  currentSection,
  activeSection,
  setActiveSection,
  isTaskAvailable,
  isPending,
  onSubmit
}) {
  if (!currentSection) {
    return /*#__PURE__*/React.createElement("div", {
      style: styles.emptyState
    }, "No sections yet. Add one from Manage.");
  }
  const tasks = currentSection.tasks;
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SectionPills, {
    sections: sections,
    activeSection: activeSection,
    setActiveSection: setActiveSection
  }), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, tasks.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: styles.emptyState
  }, "No tasks in ", currentSection.name, " yet."), tasks.map(task => {
    const pending = isPending(task.id);
    const available = isTaskAvailable(task);
    const overdue = task.deadline && new Date(task.deadline) < new Date() && available;
    return /*#__PURE__*/React.createElement("div", {
      key: task.id,
      style: styles.row
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: styles.rowTitle
    }, task.title), /*#__PURE__*/React.createElement("div", {
      style: styles.rowMeta
    }, task.freq === "daily" ? "Daily" : task.freq === "weekly" ? "Weekly" : "One-time", task.deadline ? ` · due ${new Date(task.deadline).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    })}` : "", overdue ? /*#__PURE__*/React.createElement("span", {
      style: {
        color: COLORS.spend
      }
    }, " · overdue") : "")), /*#__PURE__*/React.createElement("div", {
      style: styles.rowCredits
    }, "+", task.credits), pending ? /*#__PURE__*/React.createElement("span", {
      style: styles.badgePending
    }, "Waiting") : available ? /*#__PURE__*/React.createElement("button", {
      style: styles.smallBtnGold,
      onClick: () => onSubmit(currentSection, task)
    }, "Done") : /*#__PURE__*/React.createElement("span", {
      style: styles.badgeDone
    }, "Done", task.freq === "daily" ? " today" : task.freq === "weekly" ? " this week" : ""));
  })));
}
function StoreView({
  state,
  onRedeem,
  onStart,
  onEnd
}) {
  const [units, setUnits] = useState({});
  return /*#__PURE__*/React.createElement("div", null, state.activeSessions.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Active now"), state.activeSessions.map(s => /*#__PURE__*/React.createElement(ActiveSessionRow, {
    key: s.id,
    session: s,
    onEnd: () => onEnd(s)
  }))), /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Store"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, state.rewards.map(r => /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: styles.row
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.rowTitle
  }, r.name), /*#__PURE__*/React.createElement("div", {
    style: styles.rowMeta
  }, r.duration ? `${r.unitMinutes} min per ${r.cost} credits` : `${r.cost} credits`)), r.duration ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Stepper, {
    value: units[r.id] || 1,
    onChange: v => setUnits(u => ({
      ...u,
      [r.id]: v
    }))
  }), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => onStart(r, units[r.id] || 1)
  }, "−", r.cost * (units[r.id] || 1))) : /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => onRedeem(r)
  }, "−", r.cost))), state.rewards.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: styles.emptyState
  }, "No rewards set up yet.")));
}
function Stepper({
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: styles.stepper
  }, /*#__PURE__*/React.createElement("button", {
    style: styles.stepperBtn,
    onClick: () => onChange(Math.max(1, value - 1))
  }, "−"), /*#__PURE__*/React.createElement("span", {
    style: styles.stepperVal
  }, value), /*#__PURE__*/React.createElement("button", {
    style: styles.stepperBtn,
    onClick: () => onChange(value + 1)
  }, "+"));
}
function ActiveSessionRow({
  session,
  onEnd
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedMs = now - session.startedAt;
  const totalMs = session.minutes * 60000;
  const remaining = Math.max(0, totalMs - elapsedMs);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor(remaining % 60000 / 1000);
  const done = remaining <= 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...styles.row,
      background: COLORS.forestSoft,
      borderRadius: 8,
      border: "none",
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...styles.rowTitle,
      color: "#fff"
    }
  }, session.name), /*#__PURE__*/React.createElement("div", {
    style: {
      ...styles.rowMeta,
      color: "#D9E4DC"
    }
  }, done ? "Time's up" : `${mins}:${String(secs).padStart(2, "0")} left`)), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnLight,
    onClick: onEnd
  }, done ? "Close" : "End early"));
}
function LedgerView({
  state
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Statement"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, state.ledger.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: styles.emptyState
  }, "No activity yet."), state.ledger.map(e => /*#__PURE__*/React.createElement("div", {
    key: e.id,
    style: styles.row
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.rowTitle
  }, e.desc), /*#__PURE__*/React.createElement("div", {
    style: styles.rowMeta
  }, fmtTime(e.ts))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...styles.rowCredits,
      color: e.amount >= 0 ? COLORS.earn : COLORS.spend
    }
  }, e.amount >= 0 ? "+" : "", fmtMoney(e.amount)), /*#__PURE__*/React.createElement("div", {
    style: styles.rowMeta
  }, "bal ", e.balanceAfter))))));
}
function ApprovalsView({
  pending,
  onApprove,
  onReject
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Waiting for approval"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, pending.length === 0 && /*#__PURE__*/React.createElement("div", {
    style: styles.emptyState
  }, "Nothing waiting right now."), pending.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    style: styles.row
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.rowTitle
  }, p.title), /*#__PURE__*/React.createElement("div", {
    style: styles.rowMeta
  }, "Submitted ", fmtTime(p.submittedAt))), /*#__PURE__*/React.createElement("div", {
    style: styles.rowCredits
  }, "+", p.credits), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => onApprove(p)
  }, "Approve"), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGhost,
    onClick: () => onReject(p)
  }, "Reject"))))));
}
function ManageView({
  state,
  addSection,
  removeSection,
  addTask,
  removeTask,
  updateTask,
  renameSection,
  addReward,
  removeReward,
  updateReward,
  updatePin,
  updateKidPin,
  adjustBalance
}) {
  const [newSection, setNewSection] = useState("");
  const [taskDrafts, setTaskDrafts] = useState({});
  const [newReward, setNewReward] = useState({
    name: "",
    cost: "",
    duration: false,
    unitMinutes: ""
  });
  const [pinDraft, setPinDraft] = useState(state.pin);
  const [kidPinDraft, setKidPinDraft] = useState(state.kidPin);
  const [adjustAmt, setAdjustAmt] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [editingTask, setEditingTask] = useState(null); // taskId
  const [editingSection, setEditingSection] = useState(null); // sectionId
  const [editingReward, setEditingReward] = useState(null); // rewardId

  function draftFor(sectionId) {
    return taskDrafts[sectionId] || {
      title: "",
      credits: "",
      freq: "daily",
      deadline: ""
    };
  }
  function setDraft(sectionId, patch) {
    setTaskDrafts(d => ({
      ...d,
      [sectionId]: {
        ...draftFor(sectionId),
        ...patch
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Sections & tasks"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, state.sections.map(sec => /*#__PURE__*/React.createElement("div", {
    key: sec.id,
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6
    }
  }, editingSection === sec.id ? /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    style: {
      ...styles.input,
      fontFamily: "Fraunces, serif",
      fontSize: 16
    },
    defaultValue: sec.name,
    onBlur: e => {
      renameSection(sec.id, e.target.value.trim() || sec.name);
      setEditingSection(null);
    },
    onKeyDown: e => e.key === "Enter" && e.target.blur()
  }) : /*#__PURE__*/React.createElement("div", {
    style: styles.manageSectionTitle,
    onClick: () => setEditingSection(sec.id)
  }, sec.name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: styles.linkBtnNeutral,
    onClick: () => setEditingSection(sec.id)
  }, "Rename"), /*#__PURE__*/React.createElement("button", {
    style: styles.linkBtn,
    onClick: () => removeSection(sec.id)
  }, "Remove section"))), sec.tasks.map(t => editingTask === t.id ? /*#__PURE__*/React.createElement(EditTaskRow, {
    key: t.id,
    task: t,
    onSave: patch => {
      updateTask(sec.id, t.id, patch);
      setEditingTask(null);
    },
    onCancel: () => setEditingTask(null)
  }) : /*#__PURE__*/React.createElement("div", {
    key: t.id,
    style: styles.row
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    },
    onClick: () => setEditingTask(t.id)
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.rowTitle
  }, t.title), /*#__PURE__*/React.createElement("div", {
    style: styles.rowMeta
  }, t.credits, " credits · ", t.freq, t.deadline ? ` · due ${new Date(t.deadline).toLocaleDateString()}` : "")), /*#__PURE__*/React.createElement("button", {
    style: styles.linkBtnNeutral,
    onClick: () => setEditingTask(t.id)
  }, "Edit"), /*#__PURE__*/React.createElement("button", {
    style: styles.linkBtn,
    onClick: () => removeTask(sec.id, t.id)
  }, "Remove"))), /*#__PURE__*/React.createElement("div", {
    style: styles.draftRow
  }, /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    placeholder: "New task name",
    value: draftFor(sec.id).title,
    onChange: e => setDraft(sec.id, {
      title: e.target.value
    })
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 64
    },
    placeholder: "Credits",
    type: "number",
    value: draftFor(sec.id).credits,
    onChange: e => setDraft(sec.id, {
      credits: e.target.value
    })
  }), /*#__PURE__*/React.createElement("select", {
    style: styles.input,
    value: draftFor(sec.id).freq,
    onChange: e => setDraft(sec.id, {
      freq: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: "daily"
  }, "Daily"), /*#__PURE__*/React.createElement("option", {
    value: "weekly"
  }, "Weekly"), /*#__PURE__*/React.createElement("option", {
    value: "once"
  }, "One-time")), /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    type: "date",
    value: draftFor(sec.id).deadline,
    onChange: e => setDraft(sec.id, {
      deadline: e.target.value
    })
  }), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => {
      const d = draftFor(sec.id);
      if (!d.title.trim() || !d.credits) return;
      addTask(sec.id, {
        title: d.title.trim(),
        credits: parseInt(d.credits, 10) || 0,
        freq: d.freq,
        deadline: d.deadline ? new Date(d.deadline).toISOString() : null
      });
      setTaskDrafts(dd => ({
        ...dd,
        [sec.id]: {
          title: "",
          credits: "",
          freq: "daily",
          deadline: ""
        }
      }));
    }
  }, "Add task")))), /*#__PURE__*/React.createElement("div", {
    style: styles.draftRow
  }, /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    placeholder: "New section name",
    value: newSection,
    onChange: e => setNewSection(e.target.value)
  }), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => {
      addSection(newSection);
      setNewSection("");
    }
  }, "Add section"))), /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Store rewards"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, state.rewards.map(r => editingReward === r.id ? /*#__PURE__*/React.createElement(EditRewardRow, {
    key: r.id,
    reward: r,
    onSave: patch => {
      updateReward(r.id, patch);
      setEditingReward(null);
    },
    onCancel: () => setEditingReward(null)
  }) : /*#__PURE__*/React.createElement("div", {
    key: r.id,
    style: styles.row
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    },
    onClick: () => setEditingReward(r.id)
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.rowTitle
  }, r.name), /*#__PURE__*/React.createElement("div", {
    style: styles.rowMeta
  }, r.duration ? `${r.unitMinutes} min per ${r.cost} credits` : `${r.cost} credits`)), /*#__PURE__*/React.createElement("button", {
    style: styles.linkBtnNeutral,
    onClick: () => setEditingReward(r.id)
  }, "Edit"), /*#__PURE__*/React.createElement("button", {
    style: styles.linkBtn,
    onClick: () => removeReward(r.id)
  }, "Remove"))), /*#__PURE__*/React.createElement("div", {
    style: styles.draftRow
  }, /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    placeholder: "Reward name",
    value: newReward.name,
    onChange: e => setNewReward(r => ({
      ...r,
      name: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 64
    },
    placeholder: "Cost",
    type: "number",
    value: newReward.cost,
    onChange: e => setNewReward(r => ({
      ...r,
      cost: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("label", {
    style: styles.checkboxLabel
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: newReward.duration,
    onChange: e => setNewReward(r => ({
      ...r,
      duration: e.target.checked
    }))
  }), "Timed"), newReward.duration && /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 90
    },
    placeholder: "Min per cost",
    type: "number",
    value: newReward.unitMinutes,
    onChange: e => setNewReward(r => ({
      ...r,
      unitMinutes: e.target.value
    }))
  }), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => {
      if (!newReward.name.trim() || !newReward.cost) return;
      addReward({
        name: newReward.name.trim(),
        cost: parseInt(newReward.cost, 10) || 0,
        duration: newReward.duration,
        unitMinutes: newReward.duration ? parseInt(newReward.unitMinutes, 10) || 15 : null
      });
      setNewReward({
        name: "",
        cost: "",
        duration: false,
        unitMinutes: ""
      });
    }
  }, "Add reward"))), /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Balance adjustment"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.draftRow
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 90
    },
    placeholder: "+/- amount",
    type: "number",
    value: adjustAmt,
    onChange: e => setAdjustAmt(e.target.value)
  }), /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    placeholder: "Reason",
    value: adjustReason,
    onChange: e => setAdjustReason(e.target.value)
  }), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => {
      const n = parseInt(adjustAmt, 10);
      if (!n) return;
      adjustBalance(n, adjustReason);
      setAdjustAmt("");
      setAdjustReason("");
    }
  }, "Apply"))), /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Parent PIN"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.draftRow
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 100
    },
    value: pinDraft,
    onChange: e => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))
  }), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => updatePin(pinDraft)
  }, "Save PIN"))), /*#__PURE__*/React.createElement("div", {
    style: styles.sectionLabel
  }, "Kid PIN"), /*#__PURE__*/React.createElement("div", {
    style: styles.ledgerBlock
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.draftRow
  }, /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 100
    },
    value: kidPinDraft,
    onChange: e => setKidPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))
  }), /*#__PURE__*/React.createElement("button", {
    style: styles.smallBtnGold,
    onClick: () => updateKidPin(kidPinDraft)
  }, "Save PIN"))));
}
function EditTaskRow({
  task,
  onSave,
  onCancel
}) {
  const [title, setTitle] = useState(task.title);
  const [credits, setCredits] = useState(task.credits);
  const [freq, setFreq] = useState(task.freq);
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.slice(0, 10) : "");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...styles.draftRow,
      background: "#fff",
      borderRadius: 8,
      border: `1px solid ${COLORS.brassLight}`
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    value: title,
    onChange: e => setTitle(e.target.value),
    placeholder: "Task name"
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 64
    },
    type: "number",
    value: credits,
    onChange: e => setCredits(e.target.value),
    placeholder: "Credits"
  }), /*#__PURE__*/React.createElement("select", {
    style: styles.input,
    value: freq,
    onChange: e => setFreq(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "daily"
  }, "Daily"), /*#__PURE__*/React.createElement("option", {
    value: "weekly"
  }, "Weekly"), /*#__PURE__*/React.createElement("option", {
    value: "once"
  }, "One-time")), /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    type: "date",
    value: deadline,
    onChange: e => setDeadline(e.target.value)
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...styles.smallBtnGold,
      flex: 1
    },
    onClick: () => onSave({
      title: title.trim() || task.title,
      credits: parseInt(credits, 10) || 0,
      freq,
      deadline: deadline ? new Date(deadline).toISOString() : null
    })
  }, "Save"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...styles.smallBtnGhost,
      flex: 1
    },
    onClick: onCancel
  }, "Cancel")));
}
function EditRewardRow({
  reward,
  onSave,
  onCancel
}) {
  const [name, setName] = useState(reward.name);
  const [cost, setCost] = useState(reward.cost);
  const [duration, setDuration] = useState(reward.duration);
  const [unitMinutes, setUnitMinutes] = useState(reward.unitMinutes || "");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...styles.draftRow,
      background: "#fff",
      borderRadius: 8,
      border: `1px solid ${COLORS.brassLight}`
    }
  }, /*#__PURE__*/React.createElement("input", {
    style: styles.input,
    value: name,
    onChange: e => setName(e.target.value),
    placeholder: "Reward name"
  }), /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 64
    },
    type: "number",
    value: cost,
    onChange: e => setCost(e.target.value),
    placeholder: "Cost"
  }), /*#__PURE__*/React.createElement("label", {
    style: styles.checkboxLabel
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: duration,
    onChange: e => setDuration(e.target.checked)
  }), "Timed"), duration && /*#__PURE__*/React.createElement("input", {
    style: {
      ...styles.input,
      width: 90
    },
    type: "number",
    value: unitMinutes,
    onChange: e => setUnitMinutes(e.target.value),
    placeholder: "Min per cost"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 6,
      width: "100%"
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...styles.smallBtnGold,
      flex: 1
    },
    onClick: () => onSave({
      name: name.trim() || reward.name,
      cost: parseInt(cost, 10) || 0,
      duration,
      unitMinutes: duration ? parseInt(unitMinutes, 10) || 15 : null
    })
  }, "Save"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...styles.smallBtnGhost,
      flex: 1
    },
    onClick: onCancel
  }, "Cancel")));
}
function PinModal({
  value,
  setValue,
  error,
  onCancel,
  onSubmit
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: styles.modalOverlay
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.modalCard
  }, /*#__PURE__*/React.createElement("div", {
    style: styles.manageSectionTitle
  }, "Parent PIN"), /*#__PURE__*/React.createElement("input", {
    autoFocus: true,
    style: {
      ...styles.input,
      width: "100%",
      marginTop: 10,
      fontSize: 20,
      letterSpacing: 4,
      textAlign: "center"
    },
    type: "password",
    inputMode: "numeric",
    value: value,
    onChange: e => setValue(e.target.value.replace(/\D/g, "").slice(0, 6)),
    onKeyDown: e => e.key === "Enter" && onSubmit()
  }), error && /*#__PURE__*/React.createElement("div", {
    style: {
      color: COLORS.spend,
      fontSize: 13,
      marginTop: 6
    }
  }, error), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: {
      ...styles.smallBtnGhost,
      flex: 1
    },
    onClick: onCancel
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...styles.smallBtnGold,
      flex: 1
    },
    onClick: onSubmit
  }, "Enter"))));
}
const styles = {
  wrap: {
    fontFamily: "Inter, system-ui, sans-serif",
    background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 4px), linear-gradient(180deg, #EEF0F2 0%, #DFE2E6 100%)",
    color: COLORS.ink,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    maxWidth: 480,
    margin: "0 auto",
    position: "relative"
  },
  header: {
    background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px), linear-gradient(160deg, #0A2F57 0%, #041E42 45%, #06213F 75%, #0A2F57 100%)",
    color: "#fff",
    padding: "18px 18px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottom: `2px solid ${COLORS.brassLight}`
  },
  headerEyebrow: {
    fontFamily: "Fraunces, serif",
    fontSize: 13,
    color: "#E8ECEF",
    marginBottom: 4
  },
  balanceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 6
  },
  balanceNum: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 26,
    fontWeight: 400,
    color: COLORS.brassLight,
    letterSpacing: 0.5
  },
  balanceLabel: {
    fontSize: 13,
    color: "#D9E4DC"
  },
  modeToggle: {
    display: "flex",
    gap: 4,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 3
  },
  modeBtn: {
    border: "none",
    background: "transparent",
    color: "#D9E4DC",
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 6
  },
  modeBtnActive: {
    background: "linear-gradient(150deg, #F7F8F9 0%, #C6CAD1 100%)",
    color: COLORS.forest
  },
  body: {
    flex: 1,
    padding: "16px 16px 90px",
    overflowY: "auto"
  },
  sectionLabel: {
    fontFamily: "Fraunces, serif",
    fontSize: 15,
    color: COLORS.forest,
    marginBottom: 8,
    marginTop: 4
  },
  pillRow: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 10,
    marginBottom: 4
  },
  pill: {
    border: `1px solid ${COLORS.paperLine}`,
    background: "transparent",
    color: COLORS.inkSoft,
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 13,
    whiteSpace: "nowrap",
    flexShrink: 0
  },
  pillActive: {
    background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px), linear-gradient(160deg, #0A2F57 0%, #041E42 100%)",
    color: "#fff",
    borderColor: COLORS.forest
  },
  ledgerBlock: {
    borderTop: `1px solid ${COLORS.paperLine}`
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 2px",
    borderBottom: `1px solid ${COLORS.paperLine}`
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: 500
  },
  rowMeta: {
    fontSize: 12,
    color: COLORS.inkSoft,
    marginTop: 2
  },
  rowCredits: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 14,
    fontWeight: 500,
    color: COLORS.earn,
    minWidth: 34,
    textAlign: "right"
  },
  badgePending: {
    fontSize: 12,
    color: COLORS.brass,
    fontStyle: "italic"
  },
  badgeDone: {
    fontSize: 12,
    color: COLORS.inkSoft
  },
  smallBtnGold: {
    background: "linear-gradient(150deg, #F7F8F9 0%, #D3D6DB 45%, #A6ABB4 75%, #C6CAD1 100%)",
    color: COLORS.forest,
    border: "1px solid #838A94",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13,
    fontWeight: 700,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)"
  },
  smallBtnGhost: {
    background: "transparent",
    color: COLORS.spend,
    border: `1px solid ${COLORS.spend}`,
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13
  },
  smallBtnLight: {
    background: "rgba(255,255,255,0.15)",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "7px 12px",
    fontSize: 13
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: COLORS.spend,
    fontSize: 12,
    padding: 4
  },
  linkBtnNeutral: {
    background: "none",
    border: "none",
    color: COLORS.brass,
    fontSize: 12,
    padding: 4,
    fontWeight: 600
  },
  emptyState: {
    color: COLORS.inkSoft,
    fontSize: 14,
    padding: "20px 2px",
    fontStyle: "italic"
  },
  tabBar: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 480,
    background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px), linear-gradient(160deg, #0A2F57 0%, #041E42 50%, #0A2F57 100%)",
    display: "flex",
    padding: "8px 10px calc(8px + env(safe-area-inset-bottom))",
    gap: 4,
    borderTop: `2px solid ${COLORS.brassLight}`
  },
  tabBtn: {
    flex: 1,
    border: "none",
    background: "transparent",
    color: "#B9C7BB",
    fontSize: 13,
    padding: "10px 4px",
    borderRadius: 8,
    fontWeight: 500
  },
  tabBtnActive: {
    color: "#fff",
    background: "rgba(255,255,255,0.1)",
    borderBottom: `2px solid ${COLORS.brassLight}`
  },
  toast: {
    position: "fixed",
    bottom: 78,
    left: "50%",
    transform: "translateX(-50%)",
    background: COLORS.ink,
    color: "#fff",
    padding: "8px 16px",
    borderRadius: 20,
    fontSize: 13
  },
  stepper: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${COLORS.paperLine}`,
    borderRadius: 6,
    padding: "2px 4px"
  },
  stepperBtn: {
    border: "none",
    background: "transparent",
    fontSize: 15,
    width: 20,
    color: COLORS.forest
  },
  stepperVal: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 13,
    minWidth: 14,
    textAlign: "center"
  },
  manageSectionTitle: {
    fontFamily: "Fraunces, serif",
    fontSize: 16,
    color: COLORS.forest
  },
  draftRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: "10px 2px",
    alignItems: "center"
  },
  input: {
    border: `1px solid ${COLORS.paperLine}`,
    borderRadius: 6,
    padding: "7px 9px",
    fontSize: 13,
    background: "#fff",
    color: COLORS.ink,
    flex: "1 1 100px"
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: COLORS.inkSoft
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50
  },
  modalCard: {
    background: COLORS.paper,
    borderRadius: 10,
    padding: 20,
    width: 260
  },
  gateWrap: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    width: "100%",
    background: "repeating-linear-gradient(115deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 4px), linear-gradient(160deg, #0A2F57 0%, #041E42 45%, #06213F 75%, #0A2F57 100%)",
    padding: 24,
    textAlign: "center",
    boxSizing: "border-box"
  },
  gateEyebrow: {
    fontFamily: "Fraunces, serif",
    fontSize: 36,
    fontWeight: 600,
    color: "#F2F4F6",
    marginBottom: 10
  },
  gateSub: {
    fontSize: 17,
    color: "#B9C3CC",
    marginBottom: 40
  },
  gateButtons: {
    display: "flex",
    flexDirection: "column",
    gap: 18,
    width: "100%",
    maxWidth: 260
  },
  gateBtn: {
    background: "linear-gradient(150deg, #F7F8F9 0%, #D3D6DB 45%, #A6ABB4 75%, #C6CAD1 100%)",
    color: COLORS.forest,
    border: "1px solid #838A94",
    borderRadius: 10,
    padding: "18px 30px",
    fontSize: 20,
    fontWeight: 700,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
    width: "100%"
  },
  errorBanner: {
    marginTop: 28,
    background: "rgba(155,44,44,0.15)",
    border: "1px solid #C97B7B",
    color: "#F5D6D6",
    borderRadius: 8,
    padding: "10px 14px",
    fontSize: 12,
    fontFamily: "'IBM Plex Mono', monospace",
    maxWidth: 320,
    wordBreak: "break-word"
  },
  errorBannerFixed: {
    position: "fixed",
    bottom: 70,
    left: 10,
    right: 10,
    maxWidth: 460,
    margin: "0 auto",
    background: "#3A1414",
    border: "1px solid #9B2C2C",
    color: "#F5D6D6",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 11,
    fontFamily: "'IBM Plex Mono', monospace",
    zIndex: 40,
    wordBreak: "break-word"
  }
};
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));
