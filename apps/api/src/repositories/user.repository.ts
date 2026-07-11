import { UserModel } from "../models/core.model.js";

export class UserRepository {
  findByEmail(email: string) {
    return UserModel.findOne({ email: email.toLowerCase() });
  }

  findByGoogleId(googleId: string) {
    return UserModel.findOne({ googleId });
  }

  findById(id: string) {
    return UserModel.findById(id);
  }

  create(input: { email: string; passwordHash?: string; googleId?: string; emailVerifiedAt?: Date }) {
    return UserModel.create({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      googleId: input.googleId,
      emailVerifiedAt: input.emailVerifiedAt
    });
  }
}
