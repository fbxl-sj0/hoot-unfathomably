/*
    Project: Hoot Mobile
    -------------------

    File: types.d.ts

    Purpose:

        Defines the shared Lotide API shapes used across the application.

    Responsibilities:

        • Provide stable global types for Lotide records
        • Keep API identifiers usable as object keys and route parameters
        • Document nullable response fields that the UI must handle safely

    This file intentionally does NOT contain:

        • Runtime validation logic
        • Endpoint-specific request builders
        • React component props
*/

export {};

declare global {
  type UserId = number;
  type PostId = number;
  type CommentId = number;
  type CommunityId = number;
  type CollectionTargetId = number;
  type CollectionTargetItemId = number;
  type PrivateMessageId = number;

  type ContentType = "post" | "comment";
  type SortOption = "hot" | "new" | "top";
  type FederationStatus = "unsent" | "sent" | "received" | "posted";
  type CollectionTargetScope = "mine" | "everything";
  type CollectionTargetSort = "alphabetic" | "latest" | "items" | "software";

  type Paged<T> = {
    items: T[];
    next_page: string | null;
  };

  type ContentBlock = {
    content_text?: string | null;
    content_markdown?: string | null;
    content_html?: string | null;
  };

  type LotideContent = string | ContentBlock | null | undefined;

  type Avatar = {
    url: string;
  };

  type Profile = {
    id: UserId;
    username: string;
    host: string;
    local?: boolean;
    avatar?: Avatar;
    description?: LotideContent;
    is_bot?: boolean;
    remote_url?: string;
    suspended?: boolean;
    your_follow?: CommunityFollow;
    your_note?: ContentBlock;
    [key: string]: unknown;
  };

  type CommunityFollow = {
    accepted: boolean;
    federation_status?: FederationStatus;
    [key: string]: unknown;
  };

  type VisibilitySuppression = {
    server: boolean;
    user: boolean;
  };

  type CommunityLastPost = {
    id: PostId;
    title: string;
    created?: string;
    remote_url?: string;
    sensitive: boolean;
  };

  type Community = {
    id: CommunityId;
    name: string;
    host: string;
    local: boolean;
    description?: LotideContent;
    deleted?: boolean;
    latest_unfollow_status?: FederationStatus;
    last_post?: CommunityLastPost;
    pending_moderation_actions?: number;
    remote_post_count?: number;
    visibility_suppression?: VisibilitySuppression;
    you_are_moderator?: boolean;
    your_follow?: CommunityFollow;
    [key: string]: unknown;
  };

  type CollectionTargetOwner = {
    id?: UserId | null;
    remote_url?: string | null;
  };

  type CollectionTargetSoftwareCount = {
    software: string;
    count: number;
  };

  type CollectionTargetListItem = {
    id: CollectionTargetId;
    type: string;
    software: string;
    name: string;
    remote_url: string;
    owner: CollectionTargetOwner;
    total_items?: number | null;
    preview_item_count: number;
    latest_preview_item?: string | null;
    latest_preview_published?: string | null;
    latest_preview_url?: string | null;
    summary_excerpt?: string | null;
    your_follow?: CommunityFollow;
    latest_unfollow_status?: FederationStatus;
    [key: string]: unknown;
  };

  type CollectionTargetPreviewItem = {
    id: CollectionTargetItemId;
    ap_id: string;
    type?: string | null;
    name: string;
    url?: string | null;
    attributed_to?: string | null;
    content_html?: string | null;
    summary_html?: string | null;
    image_url?: string | null;
    published?: string | null;
    your_vote?: boolean;
    federation_status?: FederationStatus;
    [key: string]: unknown;
  };

  type CollectionTarget = {
    id: CollectionTargetId;
    type: string;
    software?: string | null;
    name: string;
    remote_url: string;
    owner: CollectionTargetOwner;
    followers?: string | null;
    first_page?: string | null;
    last_page?: string | null;
    summary_html?: string | null;
    total_items?: number | null;
    your_follow?: CommunityFollow;
    latest_unfollow_status?: FederationStatus;
    preview_item_likes_supported: boolean;
    preview_items: CollectionTargetPreviewItem[];
    [key: string]: unknown;
  };

  type CollectionTargetItemCollection = {
    id: CollectionTargetId;
    type: string;
    software?: string | null;
    name: string;
    remote_url: string;
    owner: CollectionTargetOwner;
    preview_item_likes_supported: boolean;
    preview_item_replies_supported: boolean;
    can_reply: boolean;
    [key: string]: unknown;
  };

  type CollectionTargetItemComment = {
    id: CommentId;
    remote_url?: string | null;
    content_text?: string | null;
    content_markdown?: string | null;
    content_html?: string | null;
    created: string;
    local: boolean;
    author?: Profile;
    sensitive: boolean;
    federation_status?: FederationStatus;
    [key: string]: unknown;
  };

  type CollectionTargetItem = {
    collection: CollectionTargetItemCollection;
    item: CollectionTargetPreviewItem;
    comments: CollectionTargetItemComment[];
  };

  type CollectionTargetList = {
    items: CollectionTargetListItem[];
    next_page: string | null;
    total_count: number;
    scope_total_count: number;
    software_counts: CollectionTargetSoftwareCount[];
  };

  type Post = {
    id: PostId;
    title: string;
    author?: Profile;
    community?: Community;
    created: string;
    content_text?: string;
    content_markdown?: string;
    content_html?: string;
    federation_status?: FederationStatus;
    href?: string;
    remote_url?: string;
    replies_count_total: number;
    score: number;
    sensitive?: boolean;
    sticky?: boolean;
    your_vote?: boolean | object | null;
    [key: string]: unknown;
  };

  type Comment = {
    id: CommentId;
    author?: Profile;
    attachments?: { url: string }[];
    content_text?: string;
    content_markdown?: string;
    content_html?: string;
    created: string;
    deleted?: boolean;
    federation_status?: FederationStatus;
    local?: boolean;
    remote_url?: string;
    replies?: Paged<CommentId>;
    score: number;
    sensitive?: boolean;
    your_vote?: boolean;
    [key: string]: unknown;
  };

  type NewPost = {
    community: CommunityId;
    title: string;
    content_markdown?: string;
    href?: string;
  };

  type Login = {
    token: string;
    user?: Profile;
    [key: string]: unknown;
  };

  type PrivateMessage = {
    id: PrivateMessageId;
    author: Profile;
    recipient: Profile;
    created: string;
    local: boolean;
    remote_url?: string | null;
    content_text?: string | null;
    content_markdown?: string | null;
    content_html?: string | null;
    in_reply_to?: PrivateMessageId | null;
    federation_status?: FederationStatus;
    sensitive: boolean;
    [key: string]: unknown;
  };

  type LotideContext = {
    apiUrl?: string;
    apiVersion?: number;
    login?: Login;
    [key: string]: unknown;
  };

  type InstanceInfo = {
    apiVersion: number;
    description?: LotideContent;
    site_name: string;
    software: {
      name: string;
      version: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  type ReplyNotification = {
    unseen: boolean;
    kind?: "reply";
    notificationType?:
      | "post_reply"
      | "post_mention"
      | "comment_reply"
      | "comment_mention"
      | "legacy";
    commentId: CommentId;
    origin: {
      type: ContentType;
      id: PostId | CommentId;
    };
    postId: PostId;
    post?: Post;
    reply?: Comment;
    comment?: Comment;
  };

  type UserFollowNotification = {
    unseen: boolean;
    kind: "user_follow";
    actor?: Profile;
  };

  type PrivateMessageNotification = {
    unseen: boolean;
    kind: "private_message";
    message: PrivateMessage;
  };

  type FullNotification =
    | ReplyNotification
    | UserFollowNotification
    | PrivateMessageNotification;

  type HrefData = {
    imageUrl?: string;
    isVideo?: boolean;
    linkUrl?: string;
  };

  type HeadersInit = Record<string, string>;

  const document: {
    addEventListener: (
      eventName: string,
      listener: (...args: unknown[]) => void,
      options?: boolean | unknown,
    ) => void;
  };
}

/* end of types.d.ts */
