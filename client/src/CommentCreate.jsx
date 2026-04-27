import React from "react";
import axios from "axios";
import { useState } from "react";

const CommentCreate = ({ postId }) => {
  const [content, setContent] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();

    await axios.post(`http://localhost:4001/posts/${postId}/comments`, {
      content,
    });
    setContent("");
  };
  return (
    <div>
      <form onSubmit={onSubmit}>
        <div>
          <label>New comment</label>
          <input
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
            }}
            type="text"
          />
          <button>Submit</button>
        </div>
      </form>
    </div>
  );
};

export default CommentCreate;
