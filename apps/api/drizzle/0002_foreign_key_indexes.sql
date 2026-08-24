CREATE INDEX IF NOT EXISTS `activities_room_id_index` ON `activities` (`room_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `participants_room_id_index` ON `participants` (`room_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `responses_participant_id_index` ON `responses` (`participant_id`);
