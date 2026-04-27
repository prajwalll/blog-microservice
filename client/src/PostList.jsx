import React from "react";
import axios from "axios";
import { useState } from "react";
import { useEffect } from "react";
import CommentCreate from "./CommentCreate";
import CommentsList from "./CommentsList";

const PostList = () => {
  const [posts, setPosts] = useState({});

  const fetchPosts = async () => {
    const res = await axios.get("http://localhost:4002/posts");
    console.log(res.data);
    setPosts(res.data);
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const renderdPosts = Object.values(posts).map((item) => {
    return (
      <div key={item.id}>
        <span>{item.title}</span>
        <CommentCreate postId={item.id} />

        <div style={{ marginTop: "2px", marginLeft: "2px", color: "red" }}>
          {/* <CommentsList postId={item.id} /> */}
          <CommentsList comments={item.comments} />
        </div>
      </div>
    );
  });
  return (
    <div>
      <h4>Post list</h4>
      <span>{renderdPosts}</span>
    </div>
  );
};

export default PostList;
