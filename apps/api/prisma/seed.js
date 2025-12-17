"use strict";
// =====================================================
// Database Seed Script
// =====================================================
// Creates test users with wallets using atomic transactions
// CRITICAL: User + Wallet must be created together or not at all
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
const BCRYPT_ROUNDS = 12;
const testUsers = [
    {
        email: 'alice@test.com',
        username: 'alice_rival',
        password: 'TestPass123!',
        displayName: 'Alice',
    },
    {
        email: 'bob@test.com',
        username: 'bob_champ',
        password: 'TestPass456!',
        displayName: 'Bob',
    },
];
async function createUserWithWallet(userData) {
    const passwordHash = await bcrypt_1.default.hash(userData.password, BCRYPT_ROUNDS);
    // CRITICAL: Atomic transaction - User and Wallet MUST be created together
    // If either fails, both are rolled back. No orphaned users or wallets.
    await prisma.$transaction(async (tx) => {
        // Check if user already exists
        const existingUser = await tx.user.findFirst({
            where: {
                OR: [{ email: userData.email }, { username: userData.username }],
            },
        });
        if (existingUser) {
            console.log(`⏭️  User ${userData.username} already exists, skipping...`);
            return;
        }
        // Create user
        const user = await tx.user.create({
            data: {
                email: userData.email,
                username: userData.username,
                passwordHash,
                displayName: userData.displayName,
                status: 'active',
                emailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });
        // Create wallet - MUST succeed or entire transaction fails
        await tx.wallet.create({
            data: {
                userId: user.id,
                paidBalance: BigInt(0),
                bonusBalance: BigInt(1000), // 1000 RC starting bonus
            },
        });
        console.log(`✅ Created user: ${userData.username} (${user.id})`);
    });
}
async function main() {
    console.log('🌱 Starting database seed...\n');
    for (const userData of testUsers) {
        try {
            await createUserWithWallet(userData);
        }
        catch (error) {
            console.error(`❌ Failed to create user ${userData.username}:`, error);
            throw error; // Re-throw to fail the seed process
        }
    }
    console.log('\n🎉 Seed completed successfully!');
    console.log('\nTest credentials:');
    console.log('  - alice@test.com / TestPass123!');
    console.log('  - bob@test.com / TestPass456!');
}
main()
    .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map