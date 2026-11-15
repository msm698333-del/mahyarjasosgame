(async () => {
  const p = await SPY.requireAuth();
  if (!p) return;
  SPY.topbar();
  SPY_AUDIO.playMusic('menu');
})();
