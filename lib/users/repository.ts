import { getDb } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { User, NewUser } from '@/db/schema/users';

export class UserRepository {
  async findBySuiAddress(suiAddress: string): Promise<User | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.suiAddress, suiAddress))
      .limit(1);
    return result[0] || null;
  }

  async create(input: { suiAddress: string }): Promise<User> {
    const db = getDb();
    const newUser: NewUser = {
      suiAddress: input.suiAddress,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const result = await db.insert(users).values(newUser).returning();
    return result[0];
  }

  async findById(id: string): Promise<User | null> {
    const db = getDb();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return result[0] || null;
  }
}
