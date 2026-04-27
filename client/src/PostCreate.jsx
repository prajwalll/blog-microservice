import React from "react";
import { useState } from "react";
import axios from "axios";

const PostCreate = () => {
  const [title, setTitle] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    await axios.post("http://localhost:4000/posts", {
      title,
    });

    setTitle("");
  };
  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            type="text"
            placeholder="Enter here..."
          />
          <button>Submit</button>
        </div>
      </form>
    </div>
  );
};

export default PostCreate;
