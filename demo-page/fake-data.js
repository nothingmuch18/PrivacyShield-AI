/* ================================================================
   DigiServices Portal (DEMO) — Data
   Populates the fake government portal with PII for testing
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Fake User Data
  const user = {
    name: "Rajesh Kumar Sharma",
    aadhaar: "4832 7591 6045",
    pan: "BKRPS4523F",
    dob: "15/08/1990",
    phone: "+91 98765 43210",
    email: "rajesh.sharma@email.com",
    address: "42, MG Road, Sector 15\nNoida, UP - 201301",
    photoUrl: "images/man.jpg"
  };

  // Fake Family Member Data
  const family = {
    photoUrl: "images/woman.jpg"
  };

  // Fake Documents List
  const documents = [
    { type: "Aadhaar Card", id: "4832 7591 6045", status: "Verified ✅", action: "Download" },
    { type: "PAN Card", id: "BKRPS4523F", status: "Verified ✅", action: "Download" },
    { type: "Voter ID", id: "XYZ4567890", status: "Pending ⏳", action: "Upload" },
    { type: "Passport", id: "J8234567", status: "Expired ❌", action: "Renew" }
  ];

  // Populate Header
  document.getElementById('headerName').textContent = user.name;

  // Populate Profile Section
  document.getElementById('profileImage').src = user.photoUrl;
  document.getElementById('profileName').textContent = user.name;
  document.getElementById('profileAadhaar').textContent = user.aadhaar;
  document.getElementById('profilePan').textContent = user.pan;
  document.getElementById('profileDob').textContent = user.dob;
  document.getElementById('profilePhone').textContent = user.phone;
  document.getElementById('profileEmail').textContent = user.email;

  // Populate Family Section
  document.getElementById('familyImage').src = family.photoUrl;

  // Populate Documents Table
  const tableBody = document.getElementById('documentsTableBody');
  documents.forEach(doc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${doc.type}</td>
      <td>${doc.id}</td>
      <td>${doc.status}</td>
      <td><button class="btn btn-small" onclick="alert('Demo Action')">${doc.action}</button></td>
    `;
    tableBody.appendChild(tr);
  });

  // Populate Form
  document.getElementById('inputName').value = user.name;
  document.getElementById('inputDob').value = user.dob;
  document.getElementById('inputEmail').value = user.email;
  document.getElementById('inputPhone').value = user.phone;
  document.getElementById('inputAddress').value = user.address;
  document.getElementById('inputAadhaar').value = user.aadhaar;

  // Mock Form Submit
  document.getElementById('updateForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const originalText = btn.textContent;
    btn.textContent = "Processing...";
    btn.disabled = true;
    
    setTimeout(() => {
      alert("DEMO: OTP has been sent to your mobile.");
      btn.textContent = originalText;
      btn.disabled = false;
    }, 1500);
  });
});
