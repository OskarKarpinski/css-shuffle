const button = document.getElementById("toggle-btn");

button?.addEventListener("click", () => {
  button.classList.toggle("is-active");
});
