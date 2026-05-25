const bcrypt = require('bcryptjs');

const users = [
  { email: 'arun.kumar@company.com', password: 'Arun@123' },
  { email: 'priya.sharma@company.com', password: 'Priya@123' },
  { email: 'vignesh.r@company.com', password: 'Vignesh@123' },
  { email: 'meena.s@company.com', password: 'Meena@123' },
  { email: 'rahul.verma@company.com', password: 'Rahul@123' },

  { email: 'sneha.iyer@company.com', password: 'Sneha@123' },
  { email: 'karthik.m@company.com', password: 'Karthik@123' },
  { email: 'divya.nair@company.com', password: 'Divya@123' },

  { email: 'ajay.menon@company.com', password: 'Ajay@123' },
  { email: 'lakshmi.raman@company.com', password: 'Lakshmi@123' }
];

(async () => {
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);

    console.log(`
Email: ${user.email}
Password: ${user.password}
Hash: ${hash}
----------------------------------
`);
  }
})();