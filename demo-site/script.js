document.addEventListener('DOMContentLoaded', () => {
  const transferBtn = document.getElementById('transferBtn');
  const amountInput = document.getElementById('transferAmount');
  const destSelect = document.getElementById('destinationAccount');
  
  const modal = document.getElementById('successModal');
  const modalContent = document.getElementById('modalContent');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalMessage = document.getElementById('modalMessage');

  transferBtn.addEventListener('click', () => {
    const amount = amountInput.value;
    const dest = destSelect.options[destSelect.selectedIndex].text;

    if (!amount || !destSelect.value) {
      alert("Please fill in the destination account and amount.");
      return;
    }

    // Show Modal
    modalMessage.textContent = `₹${amount} has been successfully transferred to ${dest}.`;
    
    modal.classList.remove('hidden');
    // slight delay to allow display:block to apply before animating opacity
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      modalContent.classList.remove('scale-95');
    }, 10);
  });

  closeModalBtn.addEventListener('click', () => {
    modal.classList.add('opacity-0');
    modalContent.classList.add('scale-95');
    
    setTimeout(() => {
      modal.classList.add('hidden');
      // Reset form
      amountInput.value = '';
      destSelect.value = '';
      document.getElementById('remarks').value = '';
    }, 300);
  });
});
