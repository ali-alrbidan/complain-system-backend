// src/complaints/dto/add-comment.dto.ts
import { IsOptional, IsString } from 'class-validator';
export class AddCommentDto {
  @IsString()
  content: string;

  @IsOptional()
  isInternal?: boolean; // ملاحظة داخلية أم مرئية للمواطن
}
