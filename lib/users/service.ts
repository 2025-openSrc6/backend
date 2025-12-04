import { UserRepository } from './repository';
import type { User } from '@/db/schema/users';

export class UserService {
  constructor(private userRepository: UserRepository) {}

  async findOrCreateUser(suiAddress: string): Promise<User> {
    let user = await this.userRepository.findBySuiAddress(suiAddress);
    if (!user) {
      user = await this.userRepository.create({ suiAddress });
    }
    return user;
  }
}
