import React, { useEffect } from "react";

const CommentsList = ({ comments }) => {
  const commentsShow = comments.map((item) => {
    let content;

    if (item.status === "approved") {
      content = item.content;
    }

    if (item.status === "pending") {
      content = "This comment is waiting for moderation";
    }

    if (item.status === "rejected") {
      content = "This comment has been rejected";
    }
    return <li key={item.id}>{content}</li>;
  });
  return (
    <div>
      <ul>{commentsShow}</ul>
      <br />
    </div>
  );
};

export default CommentsList;
