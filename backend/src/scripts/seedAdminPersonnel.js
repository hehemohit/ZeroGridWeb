/**
 * ZeroGrid 160 Admin Personnel Seeding Script
 * 
 * Creates 40 admin accounts for each of the 4 crisis management domains:
 * - Flood Management (40)
 * - Heatwave Management (40)
 * - Power Grid Management (40)
 * - Rescue Management (40)
 * 
 * Total: 160 Admins
 * Initial Password: ZeroGrid@Admin2026!
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/zerogrid';
const DEFAULT_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'ZeroGrid@Admin2026!';

const FLOOD_NAMES = [
  'Aarav Sharma (Flood Lead)', 'Rohan Kulkarni', 'Priya Deshmukh', 'Vikram Patil', 'Ananya Joshi',
  'Siddharth Sawant', 'Neha Gaikwad', 'Aditya Shinde', 'Pooja Jadhav', 'Rahul More',
  'Sneha Pawar', 'Nikhil Chavan', 'Tanvi Rane', 'Kunal Parab', 'Riya Salunkhe',
  'Mayur Bhise', 'Divya Mane', 'Akshay Mohite', 'Rashmi Tambe', 'Saurabh Date',
  'Isha Ghag', 'Gaurav Kadam', 'Sayali Gholap', 'Omkar Sutar', 'Tejashree Pal',
  'Chetan Vartak', 'Shraddha Tare', 'Nilesh Mhatre', 'Komal Vaidya', 'Pratik Bhoir',
  'Mansi Patil', 'Swapnil Raut', 'Deepali Thakur', 'Tejas Kini', 'Pallavi Save',
  'Bhavesh Gharat', 'Namrata Chaudhari', 'Hitesh Tamore', 'Ashwini Meher', 'Yogesh Vaze'
];

const HEAT_NAMES = [
  'Dr. Amit Verma (Heat Lead)', 'Sunita Rao', 'Rajesh Nair', 'Kavita Pillai', 'Manoj Menon',
  'Anjali Iyer', 'Suresh Krishnan', 'Meera Nambiar', 'Harish Balan', 'Geeta Kurup',
  'Vinod Panicker', 'Shobha Warrier', 'Pradeep Bhat', 'Radhika Shenoy', 'Mahesh Pai',
  'Usha Kamath', 'Ashok Hegde', 'Vani Prabhu', 'Ganesh Rao', 'Archana Nayak',
  'Satish Shetty', 'Bhavana Alva', 'Dinesh Bhandary', 'Leela Poojary', 'Prakash Rai',
  'Manjula Kulal', 'Sudhir Moolya', 'Roopa Devadiga', 'Arvind Kotian', 'Vidya Karkera',
  'Sandeep Amin', 'Shilpa Bangera', 'Ravindra Suvarna', 'Preethi Salian', 'Mohandas Mendon',
  'Jayashree Kundar', 'Jagadish Kanchan', 'Nalini Thingalaya', 'Umesh Puthran', 'Shailaja Kotian'
];

const GRID_NAMES = [
  'Er. Devendra Dixit (Grid Lead)', 'Alok Sen', 'Swati Bose', 'Sourav Mukherjee', 'Debolina Chatterjee',
  'Subhashish Banerjee', 'Anirban Ganguly', 'Paramita Roy', 'Prosenjit Dutta', 'Madhumita Ghosh',
  'Indranil Das', 'Sayantani Chakraborty', 'Tanmoy Biswas', 'Sreelekha Guha', 'Joydeep Sanyal',
  'Barnali Bagchi', 'Kaushik Majumdar', 'Monalisa Maitra', 'Arindam Samanta', 'Tuhina Poddar',
  'Saptarshi Mondal', 'Baishali Sarkar', 'Pritam Bhattacharya', 'Sharmistha Pal', 'Arup Bhowmick',
  'Rumpa Karmakar', 'Abhijit Roychaudhury', 'Suparna De', 'Soumya Halder', 'Gargi Pramanik',
  'Dipankar Paul', 'Piyali Nandi', 'Siddhartha Kundu', 'Chandrima Dasgupta', 'Somnath Sen',
  'Laboni Saha', 'Bhaskar Dhar', 'Payel Roy', 'Amitava Lahiri', 'Koyel Barman'
];

const RESCUE_NAMES = [
  'Cdr. Rakesh Chauhan (Rescue Lead)', 'Jaswinder Singh', 'Gurpreet Kaur', 'Harpreet Gill', 'Manpreet Dhillon',
  'Ravinder Sandhu', 'Balwinder Brar', 'Simran Grewal', 'Amarjit Sidhu', 'Kuldeep Bajwa',
  'Jagtar Mann', 'Paramjit Cheema', 'Tarlochan Kahlon', 'Sukhwinder Randhawa', 'Navjot Chahal',
  'Amardeep Johal', 'Mandeep Virk', 'Harjit Bains', 'Shamsher Dosanjh', 'Kanwaljit Sekhon',
  'Iqbal Deol', 'Daljit Bhullar', 'Satnam Saini', 'Ranjit Ahluwalia', 'Gurmukh Bedi',
  'Hardeep Sethi', 'Tejinder Sahni', 'Avtar Duggal', 'Pritpal Anand', 'Narinder Chadha',
  'Mohinder Oberoi', 'Surinder Kohli', 'Davinder Bhasin', 'Bhupinder Sabharwal', 'Jaspal Tandon',
  'Varinder Grover', 'Harmohan Bakshi', 'Charanjit Madan', 'Inderjit Sareen', 'Arvinder Thapar'
];

const TEAMS_CONFIG = [
  {
    prefix: 'flood',
    department: 'FLOOD_MANAGEMENT',
    domain: 'FLOOD',
    tags: ['ADMIN', 'FLOOD_MANAGEMENT', 'WATER_RESCUE', 'DEWATERING', 'ZODIAC_BOAT', 'SUBMERSIBLE_PUMP_500HP'],
    names: FLOOD_NAMES
  },
  {
    prefix: 'heat',
    department: 'HEATWAVE_MANAGEMENT',
    domain: 'HEATWAVE',
    tags: ['ADMIN', 'HEATWAVE_MANAGEMENT', 'HYDRATION', 'COOLING_SHELTER', 'MEDICAL_TRIAGE', 'MISTING_CANOPY'],
    names: HEAT_NAMES
  },
  {
    prefix: 'grid',
    department: 'POWER_GRID_MANAGEMENT',
    domain: 'POWER_GRID',
    tags: ['ADMIN', 'POWER_GRID_MANAGEMENT', 'HV_LINEMEN', 'SUBSTATION_OPS', 'BUCKET_TRUCK', 'HOTSTICK_KIT'],
    names: GRID_NAMES
  },
  {
    prefix: 'rescue',
    department: 'RESCUE_MANAGEMENT',
    domain: 'RESCUE',
    tags: ['ADMIN', 'RESCUE_MANAGEMENT', 'SEARCH_RESCUE', 'EVACUATION', 'CIVIL_DEFENSE', 'PARAMEDIC', 'EVAC_VEHICLE'],
    names: RESCUE_NAMES
  }
];

async function seedAdminPersonnel() {
  console.log(`[SeedAdminPersonnel] Connecting to MongoDB...`);
  await mongoose.connect(MONGODB_URI);
  console.log(`[SeedAdminPersonnel] Connected successfully.`);

  console.log(`[SeedAdminPersonnel] Hashing default password...`);
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  let totalUpserted = 0;
  const stats = {};

  for (const team of TEAMS_CONFIG) {
    stats[team.department] = 0;
    for (let i = 0; i < team.names.length; i++) {
      const padNum = String(i + 1).padStart(2, '0');
      const email = `admin.${team.prefix}.${padNum}@zerogrid.org`;
      const displayName = team.names[i];

      const updateData = {
        displayName,
        email,
        passwordHash,
        authProvider: 'LOCAL',
        role: 'ADMIN',
        adminApproved: true,
        profileComplete: true,
        department: team.department,
        domain: team.domain,
        tags: team.tags,
        availabilityStatus: 'AVAILABLE',
        activeTicketId: null
      };

      await User.findOneAndUpdate(
        { email },
        { $set: updateData },
        { upsert: true, new: true, runValidators: true }
      );

      stats[team.department]++;
      totalUpserted++;
    }
    console.log(`[SeedAdminPersonnel] Seeded 40 admins for department: ${team.department}`);
  }

  console.log(`\n================ SEEDING COMPLETE ================`);
  console.log(`Total Admin Accounts Upserted: ${totalUpserted}`);
  for (const [dept, count] of Object.entries(stats)) {
    console.log(` - ${dept}: ${count} accounts`);
  }
  console.log(`Default Credentials: admin.<domain>.<01-40>@zerogrid.org / ${DEFAULT_PASSWORD}`);
  console.log(`===================================================\n`);

  await mongoose.disconnect();
  console.log(`[SeedAdminPersonnel] MongoDB disconnected.`);
}

seedAdminPersonnel().catch(err => {
  console.error(`[SeedAdminPersonnel] Error:`, err);
  process.exit(1);
});
