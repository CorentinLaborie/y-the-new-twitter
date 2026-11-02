import { ApiProperty } from '@nestjs/swagger';

/** The address of the profile photo after an upload (plan L1, 2.1). */
export class AvatarDto {
  @ApiProperty({ example: '/avatars/3f2c1a9e-5b7d-4c1a-9e2f-7a8b9c0d1e2f.jpg' })
  avatarUrl!: string;
}
